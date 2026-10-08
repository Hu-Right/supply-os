/**
 * 统一搜索编排器 — Meilisearch 查询封装
 * Unified search orchestrator — Meilisearch query wrapper
 *
 * @module server/services/search-orchestrator/meili-query
 * @description 使用 filter-builder 产出的 meiliFilters 直接执行 Meilisearch 检索，
 *              处理排序映射、超时保护、健康降级标记。返回 null 表示不可用（调用方降级 MySQL）。
 */
import { getClient, isHealthy, getIndexName, markUnhealthy, tryRecover } from "../meilisearch/client";
import { MEILI_ACTIVE_FILTER } from "../../utils/notice-expired";
import type { MatchingStrategies } from "meilisearch";
import type { UnifiedSearchParams, MeiliHitResult } from "./types";

const SEARCH_TIMEOUT_MS = 5000;

/**
 * 服务端是否接受 matchingStrategy=allOptional。
 * null = 未知（首次 any 查询照常发出），false = 已被服务端 400 明确拒绝。
 *
 * 采取「撞到即学习」而不是解析版本号：现网 Meilisearch 只接受
 * last/all/frequency（代码注释里「实测 1.52 支持」是另一套环境的结论），
 * 而硬编码版本区间会在服务端升级后反向锁死功能。进程重启后自动重新探测。
 */
let supportsAllOptional: boolean | null = null;

/**
 * 判定是否为「请求本身不被接受」的 4xx 客户端错误。
 * SDK 的 MeilisearchApiError 透传了原始 Response，据此取状态码；
 * 取不到时退回按错误名判定（MeilisearchRequestError 等本地错误不在此列）。
 */
export function isClientRequestError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (typeof status === "number") return status >= 400 && status < 500;
  return (err as Error)?.name === "MeilisearchApiError";
}

/** Meilisearch 单次检索响应中被消费的字段子集（规避 SDK 分页联合类型不直接暴露 totalHits 的问题） */
type MeiliSearchOutcome = {
  hits?: Array<{ id?: unknown }>;
  totalHits?: number | null;
  estimatedTotalHits?: number | null;
};
/** multiSearch 响应子集 */
type MeiliMultiOutcome = { results?: MeiliSearchOutcome[] };

/** 排序参数 → Meilisearch sort 数组
 * deadline_sec=0（长期有效/无截止日）的排序策略：
 *   - deadline（最近截止）：has_deadline:desc → 有截止日的在前，permanent 在后
 *   - deadline_farthest（截至最远）：has_deadline:desc → 有截止日的在前，permanent 在后
 *     有截止日内按 deadline_sec:desc 降序，最远截止日排最前；permanent 排末尾
 */
function buildSortArr(sort: UnifiedSearchParams["sort"]): string[] {
  if (sort === "deadline") return ["has_deadline:desc", "deadline_sec:asc", "id:desc"];
  if (sort === "deadline_farthest") return ["has_deadline:desc", "deadline_sec:desc", "id:desc"];
  // latest：无截止日期的公告始终排在最后（与 deadline/deadline_farthest 口径一致）
  return ["has_deadline:desc", "id:desc"];
}

/**
 * 执行 Meilisearch 检索。
 * @param q 关键词（空串 = 纯筛选浏览）
 * @param meiliFilters filter-builder 产出的 filter 数组（不含基础 ACTIVE filter）
 * @param matchMode 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中，映射 allOptional）
 * @returns 检索结果；Meilisearch 不可用/失败返回 null
 */
export async function meiliQuery(
  q: string,
  meiliFilters: string[],
  sort: UnifiedSearchParams["sort"],
  page: number,
  pageSize: number,
  matchMode: "all" | "any" = "all",
): Promise<MeiliHitResult | null> {
  const client = getClient();
  if (!client) return null;
  if (!isHealthy()) {
    const recovered = await tryRecover();
    if (!recovered) return null;
  }
  const INDEX_NAME = getIndexName();

  // any 模式依赖服务端支持 allOptional；已知不支持时直接交回编排器走 MySQL
  // （mysql-fallback 的 buildKeywordUnion 用 " OR " 完整实现了 any 语义），
  // 避免每次 any 查询都白吃一发 400。
  if (matchMode === "any" && supportsAllOptional === false) return null;

  try {
    const filter: string[] = [
      MEILI_ACTIVE_FILTER.replace("{now}", String(Math.floor(Date.now() / 1000))),
      ...meiliFilters,
    ];
    const sortArr = buildSortArr(sort);
    // [修复 030-b] 移除 deadline_nearest 的 deadline_sec>0 额外过滤（与 search.ts 对齐）。
    // has_deadline:desc 排序已将 deadline_sec=0 记录推至末尾，无需额外过滤。

    const offset = (page - 1) * pageSize;
    const searchPromise = client.index(INDEX_NAME).search(q || "", {
      filter,
      sort: sortArr,
      limit: pageSize,
      offset,
      attributesToRetrieve: ["id"],
      // all=所有词必须命中（硬 AND）；any=命中任一词即可（OR）。
      // SDK 类型未声明 allOptional，但 search() 原样透传 body，故断言绕过类型检查；
      // 服务端是否接受由 supportsAllOptional 在运行期学习（见 catch 分支）。
      matchingStrategy: (matchMode === "any" ? "allOptional" : "all") as unknown as MatchingStrategies,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Meilisearch search timeout after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS);
    });
    try {
      const result = (await Promise.race([searchPromise, timeoutPromise])) as MeiliSearchOutcome | null;
      if (result === null) return null;
      const ids = (result.hits ?? []).map((h) => Number(h.id)).filter(Boolean);
      const preciseTotal = result.totalHits ?? null;
      const estimatedTotal = result.estimatedTotalHits ?? ids.length;
      return { ids, total: preciseTotal ?? estimatedTotal, totalIsPrecise: preciseTotal !== null };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    // ── 4xx（请求不被接受）与「服务不可用」必须分开对待 ──
    // 参数校验类 400 只代表我方请求与当前服务端版本不匹配，与 Meilisearch
    // 是否健康无关。此前一律 markUnhealthy()，一次 any 模式查询就能把全部搜索
    // （含正常的 all 模式）整体降级到 46 万行宽表的 MySQL FULLTEXT 查询。
    if (isClientRequestError(err)) {
      if (matchMode === "any" && /allOptional/i.test(msg)) {
        supportsAllOptional = false;
        console.warn(
          "[meilisearch] 服务端不支持 matchingStrategy=allOptional；any 模式改由 MySQL 降级承载（健康位不变）",
        );
      } else {
        console.warn("[search-orchestrator] meiliQuery 请求被服务端拒绝（不改变健康位）:", msg);
      }
      return null;
    }
    console.warn("[search-orchestrator] meiliQuery failed:", msg);
    // 超时不标记不健康：机器高负载下的慢查询不代表服务不可用，
    // 否则"超时→标记→重建→重建后首查又超时"会形成死循环；
    // 连接类错误才标记，由编排器健康探测决定是否触发索引重建
    if (!/timeout/i.test(msg)) markUnhealthy();
    return null;
  }
}

/**
 * [B1 优化] 并行多 filter 集探测：用于 prefs 模式渐进放宽。
 * 一次 HTTP 请求完成最多 4 个子查询（每个 limit:1 仅取 totalHits），
 * 替代旧版 for...of 串行探测（4 次往返 → 1 次往返）。
 * 返回 null 表示 Meilisearch 不可用（调用方走 MySQL 降级）。
 */
export async function meiliMultiQuery(
  q: string,
  meiliFiltersArr: string[][],
  sort: UnifiedSearchParams["sort"],
): Promise<MeiliHitResult[] | null> {
  const client = getClient();
  if (!client) return null;
  if (!isHealthy()) {
    const recovered = await tryRecover();
    if (!recovered) return null;
  }
  const INDEX_NAME = getIndexName();
  const nowTs = String(Math.floor(Date.now() / 1000));
  const sortArr = buildSortArr(sort);

  try {
    const queries = meiliFiltersArr.map((filters) => ({
      indexUid: INDEX_NAME,
      q: q || "",
      filter: [MEILI_ACTIVE_FILTER.replace("{now}", nowTs), ...filters],
      sort: sortArr,
      limit: 1,
      attributesToRetrieve: ["id"],
      matchingStrategy: "all" as const,
    }));

    const searchPromise = client.multiSearch({ queries });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Meilisearch multiSearch timeout after ${SEARCH_TIMEOUT_MS}ms`)),
        SEARCH_TIMEOUT_MS,
      );
    });
    try {
      const response = (await Promise.race([searchPromise, timeoutPromise])) as MeiliMultiOutcome | null;
      if (!response?.results) return null;
      return response.results.map((r) => {
        const ids = r.hits?.map((h) => Number(h.id)).filter(Boolean) ?? [];
        const preciseTotal = r.totalHits ?? null;
        const estimatedTotal = r.estimatedTotalHits ?? ids.length;
        return { ids, total: preciseTotal ?? estimatedTotal, totalIsPrecise: preciseTotal !== null };
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn("[search-orchestrator] meiliMultiQuery failed:", (err as Error).message);
    if (!/timeout/i.test((err as Error).message)) markUnhealthy();
    return null;
  }
}
