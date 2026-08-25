/**
 * server/services/notices/featured.ts 测试
 * 覆盖 FEATURED_NOTICE_EXISTS 常量、titleSimilarity（通过 findQualifiedOpportunityForNotice 间接测试）、
 * registerFeaturedSyncCallback
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  FEATURED_NOTICE_EXISTS,
  findQualifiedOpportunityForNotice,
  registerFeaturedSyncCallback,
  refreshFeaturedColumn,
} from "../../../../server/services/notices/featured";

// ── FEATURED_NOTICE_EXISTS 常量 ──
describe("FEATURED_NOTICE_EXISTS", () => {
  it("包含 converted_opp_id 路径", () => {
    expect(FEATURED_NOTICE_EXISTS).toContain("n.converted_opp_id");
  });

  it("包含 source_notice_id 路径", () => {
    expect(FEATURED_NOTICE_EXISTS).toContain("o2.source_notice_id");
  });

  it("包含 qualified 条件", () => {
    expect(FEATURED_NOTICE_EXISTS).toContain("is_qualified = 1");
    expect(FEATURED_NOTICE_EXISTS).toContain("status = 1");
    expect(FEATURED_NOTICE_EXISTS).toContain("audit_status = 1");
  });

  it("不包含 reference 路径（已移除）", () => {
    // reference 路径在 2026-08-01 被移除（撞号防御）
    expect(FEATURED_NOTICE_EXISTS).not.toContain("reference");
  });
});

// ── findQualifiedOpportunityForNotice ──
function makePool(sqlResults: Array<{ match: string | RegExp; rows: any[] }>) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      for (const entry of sqlResults) {
        const re = typeof entry.match === "string" ? new RegExp(entry.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : entry.match;
        if (re.test(sql)) return Promise.resolve([entry.rows]);
      }
      return Promise.resolve([[]]);
    }),
  } as any;
}

describe("findQualifiedOpportunityForNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converted_opp_id > 0 → 查 crm_bid_opportunities by id", async () => {
    const opp = { id: 10, title: "Test Opp" };
    const pool = makePool([{ match: "WHERE id = ?", rows: [opp] }]);
    const notice = { id: 1, converted_opp_id: 10, notice_id: "" };
    const result = await findQualifiedOpportunityForNotice(pool, notice);
    expect(result).toEqual(opp);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("WHERE id = ?");
  });

  it("converted_opp_id 无结果 + notice_id → 查 source_notice_id", async () => {
    const opp = { id: 20, title: "By Notice" };
    const pool = makePool([
      { match: "WHERE id = ?", rows: [] },
      { match: "source_notice_id = ?", rows: [opp] },
    ]);
    const notice = { id: 2, converted_opp_id: 0, notice_id: "NOTICE-001" };
    const result = await findQualifiedOpportunityForNotice(pool, notice);
    expect(result).toEqual(opp);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("reference 路径 → 标题相似度过滤", async () => {
    const opp1 = { id: 30, title: "Road Construction in Nairobi" };
    const opp2 = { id: 31, title: "Completely Different Project" };
    const pool = makePool([
      { match: "WHERE reference = ?", rows: [opp1, opp2] },
    ]);
    const notice = {
      id: 3, converted_opp_id: 0, notice_id: "",
      reference: "REF-001", title: "Road Construction Nairobi Kenya",
    };
    const result = await findQualifiedOpportunityForNotice(pool, notice);
    // opp1 标题与 notice 标题相似度高，应返回 opp1
    expect(result).toEqual(opp1);
  });

  it("reference 路径 → 标题不相似 → 返回 null", async () => {
    const opp = { id: 40, title: "Totally Unrelated Topic" };
    const pool = makePool([
      { match: "WHERE reference = ?", rows: [opp] },
    ]);
    const notice = {
      id: 4, converted_opp_id: 0, notice_id: "",
      reference: "REF-002", title: "Road Construction Kenya",
    };
    const result = await findQualifiedOpportunityForNotice(pool, notice);
    expect(result).toBeNull();
  });

  it("全部路径无结果 → null", async () => {
    const pool = makePool([]); // 所有查询返回空
    const notice = {
      id: 5, converted_opp_id: 0, notice_id: "NX",
      reference: "REF-X", title: "Test",
    };
    const result = await findQualifiedOpportunityForNotice(pool, notice);
    expect(result).toBeNull();
  });

  it("无 id 的载荷 → 跳过缓存直查", async () => {
    const pool = makePool([{ match: "WHERE id = ?", rows: [] }]);
    const notice = { converted_opp_id: 5 };
    await findQualifiedOpportunityForNotice(pool, notice);
    // 无 id → cacheKey="" → 不缓存
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("缓存命中 → 不重复查询", async () => {
    const opp = { id: 50, title: "Cached" };
    const pool = makePool([{ match: "WHERE id = ?", rows: [opp] }]);
    const notice = { id: 100, converted_opp_id: 50, notice_id: "" };

    // 第一次查询
    const r1 = await findQualifiedOpportunityForNotice(pool, notice);
    expect(r1).toEqual(opp);
    const callCount = pool.query.mock.calls.length;

    // 第二次查询 → 应命中缓存
    const r2 = await findQualifiedOpportunityForNotice(pool, notice);
    expect(r2).toEqual(opp);
    expect(pool.query.mock.calls.length).toBe(callCount); // 无新查询
  });
});

// ── registerFeaturedSyncCallback ──
describe("registerFeaturedSyncCallback", () => {
  it("注册回调不抛错", () => {
    expect(() => registerFeaturedSyncCallback(vi.fn())).not.toThrow();
  });
});

// ── refreshFeaturedColumn ──
describe("refreshFeaturedColumn", () => {
  it("无变更 → marked=0 unmarked=0", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) } as any;
    const result = await refreshFeaturedColumn(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([]);
  });
});
