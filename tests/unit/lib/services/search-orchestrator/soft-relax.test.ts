/**
 * 软 AND 放宽闸口测试（口径：仅硬 AND 零结果时放宽）
 *
 * 隔离边界：mode-resolver / filter-builder / meili-query / mysql-fallback /
 * detail-fetch / format / meilisearch client+sync / agencies 全部 vi.mock，
 * 只保留真实 params（validateParams 归一化 matchMode）与真实编排主流程。
 * 验证：① AND 零结果 → 以 OR 重查并标 match_relaxed；② AND 有结果（含极少）→ 绝不放宽；
 *      ③ 用户显式 any → 不二次放宽；④ OR 也是零 → 不标 match_relaxed；
 *      ⑤ 降级路径同样仅在零结果时放宽；⑥ 空索引降级后已有结果 → 不重复放宽。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

const mocks = vi.hoisted(() => ({
  resolveMode: vi.fn(),
  buildFilterPlan: vi.fn(),
  meiliQuery: vi.fn(),
  meiliMultiQuery: vi.fn(),
  mysqlFallback: vi.fn(),
  fetchDetailsByIds: vi.fn(),
  formatItems: vi.fn(),
  referenceFastPath: vi.fn(),
  isFullSyncRunning: vi.fn(),
  getCachedDocCount: vi.fn(),
  tryRecover: vi.fn(),
  getAgencyCacheData: vi.fn(),
  getNoticeAgencies: vi.fn(),
  logPerf: vi.fn(),
  recordFallback: vi.fn(),
  requestIndexRebuild: vi.fn(),
  registerInvalidateCallback: vi.fn(),
  recommendNotices: vi.fn(),
  invalidateProfileCache: vi.fn(),
}));

vi.mock("@/lib/services/search-orchestrator/mode-resolver", () => ({ resolveMode: mocks.resolveMode }));
vi.mock("@/lib/services/search-orchestrator/filter-builder", () => ({ buildFilterPlan: mocks.buildFilterPlan }));
vi.mock("@/lib/services/search-orchestrator/meili-query", () => ({
  meiliQuery: mocks.meiliQuery,
  meiliMultiQuery: mocks.meiliMultiQuery,
}));
vi.mock("@/lib/services/search-orchestrator/mysql-fallback", () => ({ mysqlFallback: mocks.mysqlFallback }));
vi.mock("@/lib/services/search-orchestrator/detail-fetch", () => ({ fetchDetailsByIds: mocks.fetchDetailsByIds }));
vi.mock("@/lib/services/search-orchestrator/format", () => ({ formatItems: mocks.formatItems }));
vi.mock("@/lib/services/search-orchestrator/reference-fast-path", () => ({ referenceFastPath: mocks.referenceFastPath }));
vi.mock("@/lib/services/meilisearch/sync", () => ({ isFullSyncRunning: mocks.isFullSyncRunning }));
vi.mock("@/lib/services/meilisearch/client", () => ({
  getCachedDocCount: mocks.getCachedDocCount,
  tryRecover: mocks.tryRecover,
}));
vi.mock("@/lib/services/search-common/metrics", () => ({ logPerf: mocks.logPerf, recordFallback: mocks.recordFallback }));
vi.mock("@/lib/services/search-common/rebuild-trigger", () => ({ requestIndexRebuild: mocks.requestIndexRebuild }));
vi.mock("@/lib/services/search-common/sync-events", () => ({ registerInvalidateCallback: mocks.registerInvalidateCallback }));
vi.mock("@/lib/services/recommend/index", () => ({ recommendNotices: mocks.recommendNotices }));
vi.mock("@/lib/services/industry-profile/resolve", () => ({ invalidateProfileCache: mocks.invalidateProfileCache }));
vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getNoticeAgencies: mocks.getNoticeAgencies,
  getAgencyCacheData: mocks.getAgencyCacheData,
}));

import { searchUnified } from "@/lib/services/search-orchestrator";

const noopPool = {} as Pool;
const idsOf = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveMode.mockResolvedValue({ kind: "search", codeUnspsc: null, profileLevels: null });
  mocks.buildFilterPlan.mockResolvedValue({
    meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "none",
  });
  mocks.referenceFastPath.mockResolvedValue(null);
  mocks.isFullSyncRunning.mockReturnValue(false);
  mocks.getCachedDocCount.mockResolvedValue(100000);
  // 降级分支会先做健康探测（tryRecover().catch），必须返回 Promise否则探路本身报错
  mocks.tryRecover.mockResolvedValue(false);
  mocks.getAgencyCacheData.mockReturnValue([{ agency: "x" }]); // 非空 → 跳过惰性预热
  mocks.fetchDetailsByIds.mockResolvedValue([]);
  mocks.formatItems.mockReturnValue([]);
});

describe("软 AND 放宽闸口（仅零结果，_searchCore）", () => {
  it("硬 AND 零结果 → 以 OR 重查一次并采用 + match_relaxed", async () => {
    mocks.meiliQuery
      .mockResolvedValueOnce({ ids: [], total: 0, totalIsPrecise: true }) // all
      .mockResolvedValueOnce({ ids: idsOf(28), total: 28, totalIsPrecise: true }); // any

    const res = await searchUnified(noopPool, { q: "alpha beta gamma", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(2);
    expect(mocks.meiliQuery.mock.calls[0][5]).toBe("all");
    expect(mocks.meiliQuery.mock.calls[1][5]).toBe("any");
    expect(res.total).toBe(28);
    expect(res.match_relaxed).toBe(true);
  });

  it("硬 AND 命中极少（3 条）但非零 → 绝不放宽（本期收紧的核心断言）", async () => {
    // 旧口径（0<total<5）会在这里放宽成海量弱相关：实测 AND=28 / OR=5469
    // ⚠️ q 必须全局唯一：searchUnified 有模块级结果缓存，复用 q 会直接抹引引擎调用
    mocks.meiliQuery.mockResolvedValueOnce({ ids: idsOf(3), total: 3, totalIsPrecise: true });

    const res = await searchUnified(noopPool, { q: "bravo two three", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(3);
    expect(res).not.toHaveProperty("match_relaxed");
  });

  it("硬 AND 结果充足 → 不触发放宽，无 match_relaxed", async () => {
    mocks.meiliQuery.mockResolvedValueOnce({ ids: idsOf(50), total: 50, totalIsPrecise: true });

    const res = await searchUnified(noopPool, { q: "water supply plant", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(50);
    expect(res).not.toHaveProperty("match_relaxed");
  });

  it("用户显式选 any → 主查询即 any，不再二次放宽", async () => {
    mocks.meiliQuery.mockResolvedValueOnce({ ids: idsOf(3), total: 3, totalIsPrecise: true });

    const res = await searchUnified(noopPool, { q: "delta epsilon zeta", page: 1, pageSize: 10, matchMode: "any" });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(1);
    expect(mocks.meiliQuery.mock.calls[0][5]).toBe("any");
    expect(res).not.toHaveProperty("match_relaxed");
  });

  it("零结果且 OR 也零 → 不标 match_relaxed（确实无匹配，非放宽所得）", async () => {
    mocks.meiliQuery
      .mockResolvedValueOnce({ ids: [], total: 0, totalIsPrecise: true })
      .mockResolvedValueOnce({ ids: [], total: 0, totalIsPrecise: true });

    const res = await searchUnified(noopPool, { q: "kappa lambda mu", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(2);
    expect(res.total).toBe(0);
    expect(res).not.toHaveProperty("match_relaxed");
  });

  it("降级路径：MySQL 硬 AND 零结果才放宽，且第二次以 matchMode=any 下发", async () => {
    mocks.meiliQuery.mockResolvedValueOnce(null); // 引擎不可用 → 走 MySQL（用 Once 避免污染后续用例）
    mocks.mysqlFallback
      .mockResolvedValueOnce({ ids: [], total: 0 })
      .mockResolvedValueOnce({ ids: idsOf(9), total: 9 });

    const res = await searchUnified(noopPool, { q: "医疗 建筑", page: 1, pageSize: 10 });

    expect(mocks.mysqlFallback).toHaveBeenCalledTimes(2);
    expect(mocks.mysqlFallback.mock.calls[0][1].matchMode).not.toBe("any");
    expect(mocks.mysqlFallback.mock.calls[1][1].matchMode).toBe("any");
    expect(res.total).toBe(9);
    expect(res.match_relaxed).toBe(true);
  });

  it("降级路径：MySQL 有结果（哪怕 1 条）→ 不放宽，不额外打库", async () => {
    mocks.meiliQuery.mockResolvedValueOnce(null);
    mocks.mysqlFallback.mockResolvedValueOnce({ ids: idsOf(1), total: 1 });

    const res = await searchUnified(noopPool, { q: "医疗 建筑 -学校", page: 1, pageSize: 10 });

    expect(mocks.mysqlFallback).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(1);
    expect(res).not.toHaveProperty("match_relaxed");
  });

  it("Meili 零结果但索引为空→降级 MySQL 拿到结果 → 不重复放宽", async () => {
    mocks.meiliQuery.mockResolvedValueOnce({ ids: [], total: 0, totalIsPrecise: true });
    mocks.getCachedDocCount.mockResolvedValueOnce(10); // <1000 → 判为索引不完整
    mocks.mysqlFallback.mockResolvedValueOnce({ ids: idsOf(5), total: 5 });

    const res = await searchUnified(noopPool, { q: "zeta eta theta", page: 1, pageSize: 10 });

    // 空索引降级只查一次 MySQL；因已有 5 条结果，放宽闸口不得再发二次查询
    expect(mocks.mysqlFallback).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(5);
    expect(res).not.toHaveProperty("match_relaxed");
  });
});
