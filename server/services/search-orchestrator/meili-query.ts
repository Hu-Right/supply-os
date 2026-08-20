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
import type { UnifiedSearchParams, MeiliHitResult } from "./types";

const SEARCH_TIMEOUT_MS = 5000;

/** 排序参数 → Meilisearch sort 数组（与 search.ts 口径一致） */
function buildSortArr(sort: UnifiedSearchParams["sort"]): string[] {
  if (sort === "latest") return ["id:desc"];
  if (sort === "deadline") return ["has_deadline:desc", "deadline_sec:asc", "id:desc"];
  return ["has_deadline:desc", "deadline_sec:desc", "id:desc"];
}

/**
 * 执行 Meilisearch 检索。
 * @param q 关键词（空串 = 纯筛选浏览）
 * @param meiliFilters filter-builder 产出的 filter 数组（不含基础 ACTIVE filter）
 * @returns 检索结果；Meilisearch 不可用/失败返回 null
 */
export async function meiliQuery(
  q: string,
  meiliFilters: string[],
  sort: UnifiedSearchParams["sort"],
  page: number,
  pageSize: number,
): Promise<MeiliHitResult | null> {
  const client = getClient();
  if (!client) return null;
  if (!isHealthy()) {
    const recovered = await tryRecover();
    if (!recovered) return null;
  }
  const INDEX_NAME = getIndexName();

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
      matchingStrategy: "all",
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Meilisearch search timeout after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([searchPromise, timeoutPromise]) as any;
      if (result === null) return null;
      const ids = result.hits.map((h: any) => Number(h.id)).filter(Boolean);
      const preciseTotal = result.totalHits ?? null;
      const estimatedTotal = result.estimatedTotalHits ?? ids.length;
      return { ids, total: preciseTotal ?? estimatedTotal, totalIsPrecise: preciseTotal !== null };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn("[search-orchestrator] meiliQuery failed:", (err as Error).message);
    // 超时不标记不健康：机器高负载下的慢查询不代表服务不可用，
    // 否则"超时→标记→重建→重建后首查又超时"会形成死循环；
    // 连接类错误才标记，由编排器健康探测决定是否触发索引重建
    if (!/timeout/i.test((err as Error).message)) markUnhealthy();
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
      const response = await Promise.race([searchPromise, timeoutPromise]) as any;
      if (!response?.results) return null;
      return (response.results as any[]).map((r) => {
        const ids = r.hits?.map((h: any) => Number(h.id)).filter(Boolean) ?? [];
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
