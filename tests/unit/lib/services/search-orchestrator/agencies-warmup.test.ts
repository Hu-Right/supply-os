/**
 * 搜索链路的机构预热边界（2026-10-30 翻页卡顿根因修复）
 *
 * 钉两件事：
 * 1. _searchCore **绝不**触发机构聚合（refreshNoticeAgencies / getNoticeAgencies）。
 *    实测该聚合是 `GROUP BY COALESCE(NULLIF(agency_full,''),agency)` 全表扫描：
 *    EXPLAIN type=ALL rows=984571、单条 40848ms，返回 81836 行；而连接池只有 10
 *    （DB_POOL_LIMIT），10 分钟 TTL 过期后的第一条翻页会在后台把它占住一格数十秒，
 *    翻页因此排队到前端 30s 硬超时。买家名自 2026-10-29「绝对准确」口径起改读
 *    服务宽表 + agency_aliases 别名快照，聚合缓存对列表已无消费方。
 * 2. 机构中文精名依赖的别名快照仍要预热，但走轻量出口（agency_aliases 全表 SELECT
 *    实测 2.9~4.8s、COUNT 121ms，无 GROUP BY 无临时表），且快照就绪时零查库。
 *
 * 隔离边界：与 soft-relax.test.ts 同一套 —— 下游模块全部 vi.mock，只保留真实
 * params 归一与编排主流程。
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
  ensureAgencyDisplayWarmup: vi.fn(),
  referenceFastPath: vi.fn(),
  isFullSyncRunning: vi.fn(),
  getCachedDocCount: vi.fn(),
  tryRecover: vi.fn(),
  getNoticeAgencies: vi.fn(),
  getAgencyCacheData: vi.fn(),
  logPerf: vi.fn(),
  recordFallback: vi.fn(),
  requestIndexRebuild: vi.fn(),
  registerInvalidateCallback: vi.fn(),
  recommendNotices: vi.fn(),
  invalidateProfileCache: vi.fn(),
  isAgencyDisplaySnapshotReady: vi.fn(),
}));

vi.mock("@/lib/services/search-orchestrator/mode-resolver", () => ({ resolveMode: mocks.resolveMode }));
vi.mock("@/lib/services/search-orchestrator/filter-builder", () => ({ buildFilterPlan: mocks.buildFilterPlan }));
vi.mock("@/lib/services/search-orchestrator/meili-query", () => ({
  meiliQuery: mocks.meiliQuery,
  meiliMultiQuery: mocks.meiliMultiQuery,
}));
vi.mock("@/lib/services/search-orchestrator/mysql-fallback", () => ({ mysqlFallback: mocks.mysqlFallback }));
vi.mock("@/lib/services/search-orchestrator/detail-fetch", () => ({ fetchDetailsByIds: mocks.fetchDetailsByIds }));
vi.mock("@/lib/services/search-orchestrator/format", () => ({
  formatItems: mocks.formatItems,
  ensureAgencyDisplayWarmup: mocks.ensureAgencyDisplayWarmup,
}));
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
vi.mock("@/lib/services/agency/resolve", () => ({
  isAgencyDisplaySnapshotReady: mocks.isAgencyDisplaySnapshotReady,
}));
vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getNoticeAgencies: mocks.getNoticeAgencies,
  getAgencyCacheData: mocks.getAgencyCacheData,
}));

import { searchUnified } from "@/lib/services/search-orchestrator";

const noopPool = {} as Pool;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveMode.mockResolvedValue({ kind: "search", category: null, profileNodes: null });
  mocks.buildFilterPlan.mockResolvedValue({
    meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: false, digest: "none",
  });
  mocks.referenceFastPath.mockResolvedValue(null);
  mocks.isFullSyncRunning.mockReturnValue(false);
  mocks.getCachedDocCount.mockResolvedValue(100000);
  mocks.tryRecover.mockResolvedValue(false);
  mocks.meiliQuery.mockResolvedValue({ ids: [1, 2], total: 2, totalIsPrecise: true });
  mocks.fetchDetailsByIds.mockResolvedValue([{ notice_pk: 1 }, { notice_pk: 2 }]);
  mocks.formatItems.mockReturnValue([{ notice_pk: 1 }, { notice_pk: 2 }]);
  mocks.ensureAgencyDisplayWarmup.mockResolvedValue(undefined);
  // 默认场景：机构下拉聚合缓存冷（原实现在此处会立刻后台打开发 40s 全表聚合）
  mocks.getAgencyCacheData.mockReturnValue(null);
  mocks.getNoticeAgencies.mockResolvedValue([]);
  mocks.isAgencyDisplaySnapshotReady.mockReturnValue(false);
});

describe("搜索链路不再预热机构聚合（_searchCore）", () => {
  it("机构聚合缓存为空 → 也绝不触发聚合（翻页不被 40s 全表扫描抢连接）", async () => {
    const res = await searchUnified(noopPool, { q: "alpha warmup-probe", page: 1, pageSize: 10 });

    expect(res.total).toBe(2); // 主流程确实跑到了尾，断言不是「提前 return 假通过」
    expect(mocks.getNoticeAgencies).not.toHaveBeenCalled();
    expect(mocks.getAgencyCacheData).not.toHaveBeenCalled();
  });

  it("别名快照未就绪 → 只走轻量预热出口，且不阻塞响应", async () => {
    await searchUnified(noopPool, { q: "beta warmup-probe", page: 1, pageSize: 10 });

    expect(mocks.ensureAgencyDisplayWarmup).toHaveBeenCalledTimes(1);
  });

  it("别名快照已就绪 → 零查库（10 分钟 TTL 内不反复重读别名表）", async () => {
    mocks.isAgencyDisplaySnapshotReady.mockReturnValue(true);

    await searchUnified(noopPool, { q: "gamma warmup-probe", page: 1, pageSize: 10 });
    await searchUnified(noopPool, { q: "delta warmup-probe", page: 2, pageSize: 10 });

    expect(mocks.ensureAgencyDisplayWarmup).not.toHaveBeenCalled();
  });

  it("prefs 模式（行业匹配）同样不打机构聚合", async () => {
    mocks.resolveMode.mockResolvedValue({
      kind: "search", category: { node: "UGT-01" }, profileNodes: [{ level: 1, node: "UGT-01" }],
    });
    mocks.meiliMultiQuery.mockResolvedValue([{ ids: [1], total: 500, totalIsPrecise: true }]);

    await searchUnified(noopPool, { mode: "prefs", userId: 7, q: "epsilon warmup-probe", page: 1, pageSize: 10 });

    expect(mocks.getNoticeAgencies).not.toHaveBeenCalled();
  });

  it("recommended 模式同样不打机构聚合", async () => {
    mocks.recommendNotices.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, variant: "v1" });

    await searchUnified(noopPool, { mode: "recommended", userId: 7, page: 1, pageSize: 10 });

    expect(mocks.getNoticeAgencies).not.toHaveBeenCalled();
    expect(mocks.ensureAgencyDisplayWarmup).toHaveBeenCalledTimes(1);
  });
});
