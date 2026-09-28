/**
 * 软 AND 自动放宽测试（spec：硬 AND 结果过少时退化 OR）
 *
 * 隔离边界：mode-resolver / filter-builder / meili-query / mysql-fallback /
 * detail-fetch / format / meilisearch client+sync / agencies 全部 vi.mock，
 * 只保留真实 params（validateParams 归一化 matchMode）与真实编排主流程。
 * 验证：① 硬 AND 命中 0<total<阈值 → 用 OR 再查一次并采用更多结果 + match_relaxed；
 *      ② 结果充足 → 不触发放宽；③ 用户显式 any → 不触发二次放宽；
 *      ④ 放宽后并不更多 → 保留原结果，不标 match_relaxed。
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
  mocks.getAgencyCacheData.mockReturnValue([{ agency: "x" }]); // 非空 → 跳过惰性预热
  mocks.fetchDetailsByIds.mockResolvedValue([]);
  mocks.formatItems.mockReturnValue([]);
});

describe("软 AND 自动放宽（_searchCore）", () => {
  it("硬 AND 命中过少 → 用 OR 再查一次并采用更多结果 + match_relaxed", async () => {
    mocks.meiliQuery
      .mockResolvedValueOnce({ ids: idsOf(3), total: 3, totalIsPrecise: true }) // all
      .mockResolvedValueOnce({ ids: idsOf(28), total: 28, totalIsPrecise: true }); // any

    const res = await searchUnified(noopPool, { q: "alpha beta gamma", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(2);
    // 第一次按默认 all，第二次放宽为 any
    expect(mocks.meiliQuery.mock.calls[0][5]).toBe("all");
    expect(mocks.meiliQuery.mock.calls[1][5]).toBe("any");
    expect(res.total).toBe(28);
    expect(res.match_relaxed).toBe(true);
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

  it("放宽后结果并不更多 → 保留原结果，不标 match_relaxed", async () => {
    mocks.meiliQuery
      .mockResolvedValueOnce({ ids: idsOf(3), total: 3, totalIsPrecise: true }) // all
      .mockResolvedValueOnce({ ids: idsOf(3), total: 3, totalIsPrecise: true }); // any 未更多

    const res = await searchUnified(noopPool, { q: "kappa lambda mu", page: 1, pageSize: 10 });

    expect(mocks.meiliQuery).toHaveBeenCalledTimes(2);
    expect(res.total).toBe(3);
    expect(res).not.toHaveProperty("match_relaxed");
  });
});
