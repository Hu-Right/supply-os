/**
 * 统一搜索编排器 — 主入口
 * Unified search orchestrator — main entry
 *
 * @module server/services/search-orchestrator
 * @description 《搜索链路架构级统一重构方案》核心实现：
 *              参数校验 → 模式解析 → 参考号快速路径 → Meilisearch 主检索
 *              → （应急）MySQL 降级 → 详情获取 → 格式化 → 按需补翻。
 *
 *              单一事实源原则：Meilisearch 是唯一检索引擎；MySQL 仅承担
 *              详情获取与应急降级（降级时自动触发索引重建标记）。
 *
 *              三种模式：
 *              - default:      URL 筛选参数 → filter-builder → Meilisearch
 *              - prefs:        + 用户行业画像渐进放宽（替代旧 T0-T3 两阶段架构）
 *              - recommended:  委托既有推荐服务（行为评分语义专属管道）
 */
import type { Pool } from "mysql2/promise";
import type { UnifiedSearchParams, UnifiedSearchResult, SearchPath } from "./types";
import { validateParams, searchCacheKey, type RawSearchParams } from "./params";
import { buildFilterPlan } from "./filter-builder";
import { resolveMode, type UnspscFilter } from "./mode-resolver";
import { meiliQuery } from "./meili-query";
import { mysqlFallback } from "./mysql-fallback";
import { isFullSyncRunning } from "../meilisearch/sync";
import { tryRecover } from "../meilisearch/client";
import { referenceFastPath } from "./reference-fast-path";
import { fetchDetailsByIds } from "./detail-fetch";
import { formatItems } from "./format";
import { logPerf, recordFallback } from "./metrics";
import { requestIndexRebuild } from "./rebuild-trigger";
import { recommendNotices } from "../recommend/index";

// ── 结果缓存（5 分钟 TTL，与旧模块口径一致）──
const resultCache = new Map<string, { data: UnifiedSearchResult; expires: number }>();
const RESULT_CACHE_TTL = 5 * 60 * 1000;
const RESULT_CACHE_MAX = 200;

function cacheSet(key: string, data: UnifiedSearchResult): void {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    const now = Date.now();
    for (const [k, entry] of resultCache) {
      if (entry.expires <= now) resultCache.delete(k);
    }
    if (resultCache.size >= RESULT_CACHE_MAX) resultCache.clear();
  }
  resultCache.set(key, { data, expires: Date.now() + RESULT_CACHE_TTL });
}

/** 失效行业匹配相关缓存（用户修改行业偏好后调用） */
export function invalidateUnifiedSearchCache(userKey?: string): void {
  if (!userKey) {
    resultCache.clear();
    return;
  }
  for (const key of resultCache.keys()) {
    if (key.includes(`|${userKey}|`) || key.startsWith(`prefs|${userKey}`)) {
      resultCache.delete(key);
    }
  }
}

/**
 * 统一搜索主入口。
 * @param raw 路由层解析的原始参数
 *
 * 架构约束：搜索链路只读宽表已缓存译文，绝不触发翻译请求。
 * 译文生产统一收敛到两条路径：定时任务（translation/auto.ts）与
 * 详情页按需翻译（/api/notices/:id/translation）。
 */
export async function searchUnified(
  pool: Pool,
  raw: RawSearchParams,
): Promise<UnifiedSearchResult> {
  const t0 = Date.now();
  const p = validateParams(raw);

  // ── 缓存检查 ──
  const cacheKey = searchCacheKey(p);
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  // ── recommended 模式：委托既有推荐服务（模式专属管道）──
  if (p.mode === "recommended") {
    const reco = await recommendNotices(pool, p.userKey, p.page, p.pageSize, p.locale || undefined);
    logPerf({
      mode: "recommended", path: "reco-delegate", q: "", filterDigest: "reco",
      meiliMs: 0, detailMs: 0, totalMs: Date.now() - t0,
      total: reco.total, ids: reco.items.length, page: p.page, cache: "miss",
    });
    return {
      items: reco.items,
      total: reco.total,
      page: reco.page,
      pageSize: reco.pageSize,
      variant: reco.variant,
      fallback: "none",
    };
  }

  // ── 模式解析 ──
  const resolution = await resolveMode(pool, p);
  if (resolution.kind === "no-prefs") {
    return { items: [], total: 0, page: p.page, pageSize: p.pageSize, fallback: "no_prefs" };
  }

  // ── 参考号精确匹配快速路径 ──
  if (p.q && p.mode === "default") {
    const refId = await referenceFastPath(pool, p.q);
    if (refId) {
      const details = await fetchDetailsByIds(pool, [refId], p.locale);
      const items = formatItems(details, p.locale);
      const result: UnifiedSearchResult = { items, total: 1, page: 1, pageSize: p.pageSize, fallback: "none" };
      logPerf({
        mode: p.mode, path: "ref-exact", q: p.q, filterDigest: "ref",
        meiliMs: 0, detailMs: 0, totalMs: Date.now() - t0,
        total: 1, ids: items.length, page: 1, cache: "miss",
      });
      return result;
    }
  }

  // ── prefs 渐进放宽：确定有效层级（最深优先，不足时逐级放宽）──
  let unspsc: UnspscFilter | null = resolution.codeUnspsc;
  if (resolution.profileLevels) {
    const offset = (p.page - 1) * p.pageSize;
    let chosen: { level: number; id: string; score: number } | null = null;
    for (const entry of resolution.profileLevels) {
      const probePlan = await buildFilterPlan(pool, p, { level: entry.level, id: entry.id, precise: true });
      if (probePlan.conflictEmpty) {
        const empty: UnifiedSearchResult = { items: [], total: 0, page: p.page, pageSize: p.pageSize, fallback: "no_match" };
        cacheSet(cacheKey, empty);
        return empty;
      }
      chosen = entry; // 记录当前最浅候选
      const probe = await meiliQuery(p.q, probePlan.meiliFilters, p.sort, 1, 1);
      if (!probe) break; // Meilisearch 不可用：终止探测，主流程走降级
      if (probe.total >= offset + p.pageSize) break; // 该层级足以覆盖当前页
    }
    if (chosen) {
      unspsc = { level: chosen.level, id: chosen.id, precise: true };
    }
  }

  // ── 构建 filter 计划（全系统唯一筛选语义）──
  const plan = await buildFilterPlan(pool, p, unspsc);
  if (plan.conflictEmpty) {
    const empty: UnifiedSearchResult = { items: [], total: 0, page: p.page, pageSize: p.pageSize, fallback: "no_match" };
    cacheSet(cacheKey, empty);
    return empty;
  }

  // ── Meilisearch 主检索（全量重建窗口内索引不完整，直接走 MySQL 降级）──
  let ids: number[] = [];
  let total = 0;
  let path: SearchPath = "meili";
  const meiliStart = Date.now();
  const meiliResult = isFullSyncRunning() ? null : await meiliQuery(p.q, plan.meiliFilters, p.sort, p.page, p.pageSize);
  const meiliMs = Date.now() - meiliStart;

  if (meiliResult) {
    ids = meiliResult.ids;
    total = meiliResult.total;
  } else {
    // ── MySQL 应急降级（Meilisearch 不可用或索引重建中）──
    // 注意：重建窗口内的降级（fullsync-running）不重复标记重建，
    // 否则形成“重建中降级 → 再标记 → 重建完又重建”的反馈环；
    // 搜索超时 ≠ 服务不可用：标记前先做健康探测，探测通过则视为
    // 机器高负载下的瞬时慢查询，不标记重建（重建后首次搜索 facet
    // 预热较慢，否则会进入“超时→标记→重建→再超时”的死循环）
    const fullsyncActive = isFullSyncRunning();
    recordFallback(fullsyncActive ? "fullsync-running" : "meili-unhealthy");
    if (!fullsyncActive) {
      const recovered = await tryRecover().catch(() => false);
      if (!recovered) requestIndexRebuild("fallback-triggered");
    }
    const fb = await mysqlFallback(pool, p, plan);
    ids = fb.ids;
    total = fb.total;
    path = "mysql";
  }

  if (ids.length === 0) {
    const empty: UnifiedSearchResult = {
      items: [], total, page: p.page, pageSize: p.pageSize,
      fallback: path === "mysql" ? "mysql_degraded" : "no_match",
    };
    cacheSet(cacheKey, empty);
    logPerf({
      mode: p.mode, path, q: p.q, filterDigest: plan.digest,
      meiliMs, detailMs: 0, totalMs: Date.now() - t0,
      total, ids: 0, page: p.page, cache: "miss",
    });
    return empty;
  }

  // ── 详情获取（MySQL 唯一职责：按 ID 取完整字段）──
  // 列表译文仅从宽表读取（title_{lang}/description_{lang}），不触发任何翻译请求。
  // 译文生产统一收敛到两条路径：定时任务（auto.ts 每日 06:00/13:00）与
  // 详情页按需翻译（/api/notices/:id/translation），均经 syncWideIds 级联回写宽表。
  const detailStart = Date.now();
  const details = await fetchDetailsByIds(pool, ids, p.locale);
  const detailMs = Date.now() - detailStart;

  // ── 格式化（prefs 模式逐文档计算匹配档次：公告自身 precise 层级与用户画像比对，
  //    [阶段0 A2] 替代旧版整页统一赋分，放宽场景下深层精确命中不再被误标为宽泛相关）──
  const items = formatItems(details, p.locale, resolution.profileLevels ?? undefined);

  const result: UnifiedSearchResult = {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    fallback: path === "mysql" ? "mysql_degraded" : "none",
  };
  cacheSet(cacheKey, result);

  logPerf({
    mode: p.mode, path, q: p.q, filterDigest: plan.digest,
    meiliMs, detailMs, totalMs: Date.now() - t0,
    total, ids: ids.length, page: p.page, cache: "miss",
  });
  return result;
}

// ── barrel export ──
export type { UnifiedSearchParams, UnifiedSearchResult, SearchMode, FilterPlan } from "./types";
export { validateParams, type RawSearchParams } from "./params";
