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
    // PERF 优化：最近截止排序排除 deadline_sec=0（与 search.ts 一致）
    if (sort === "deadline") filter.push("deadline_sec > 0");

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
    markUnhealthy();
    return null;
  }
}
