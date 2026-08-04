// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  searchNotices,
  getNoticeCountries,
  getNoticeStats,
} from "../../../server/services/noticeSearch";
import { recommendNotices } from "../../../server/services/noticeRecommend";

/** 按 SQL 内容路由结果的 mock pool */
function makeSearchPool(overrides: Record<string, any[]> = {}) {
  return {
    query: vi.fn(async (sql: string, _params?: any[]) => {
      const s = String(sql);
      for (const [marker, rows] of Object.entries(overrides)) {
        if (s.includes(marker)) return [rows];
      }
      if (s.includes("COUNT(DISTINCT n.id)")) return [[{ total: 1 }]];
      // recommendNotices 无兴趣信号时的 deadline 回退：总数 + 列表
      if (s.startsWith("SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE")) return [[{ total: 1 }]];
      if (s.includes("ORDER BY IF(n.deadline_ts")) {
        return [[{
          id: 11, notice_id: "EXT-1", reference: "UNGM-2026-001", title: "水泵采购公告",
          notice_type: "tender", country: "中国", deadline: "2026-12-31",
          deadline_ts: null, estimated_value: null, description: "采购工业水泵",
          documents: '[{"url":"http://x/a.pdf","name":"a.pdf"}]', procurement_files: null,
        }]];
      }
      if (s.includes("SELECT DISTINCT n.id")) {
        return [[{
          id: 11, notice_id: "EXT-1", reference: "UNGM-2026-001", title: "水泵采购公告",
          notice_type: "tender", country: "中国", deadline: "2026-12-31",
          deadline_ts: null, estimated_value: null, description: "采购工业水泵",
        }]];
      }
      if (s.includes("SELECT n.id FROM crm_bid_notices n WHERE n.id IN")) return [[{ id: 11 }]];
      if (s.includes("documents, procurement_files")) {
        return [[{ id: 11, documents: '[{"url":"http://x/a.pdf","name":"a.pdf"}]', procurement_files: null }]];
      }
      if (s.includes("GROUP BY n.country")) return [[{ country: "中国", cnt: "8" }, { country: "德国", cnt: "3" }]];
      return [[]];
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

// ─── searchNotices ──────────────────────────────────────────────────────────
describe("searchNotices", () => {
  it("returns mapped items with lock flags and breakdown counts", async () => {
    const pool = makeSearchPool();
    const result = await searchNotices(pool, { page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 11,
      title: "水泵采购公告",
      agency: null,
      source_url: null,
      unspsc_codes: [],
      core_locked: true,
      is_featured: true, // 精选标注查询命中 id=11
      breakdown_file_count: 1, // documents 中一份文件
    });
  });

  it("compacts and uppercases the q param for reference exact match", async () => {
    const pool = makeSearchPool();
    await searchNotices(pool, { page: 1, pageSize: 20, q: "ungm 2026" });

    const countCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("COUNT(DISTINCT n.id)")
    )!;
    // 首个参数为去空格大写化的 reference 精确匹配串
    expect(countCall[1][0]).toBe("UNGM2026");
    expect(countCall[1]).toContain("%ungm 2026%");
    // q 触发译文表 join
    expect(String(countCall[0])).toContain("crm_notice_translations");
  });

  it("appends country / date / within-days / type filters", async () => {
    const pool = makeSearchPool();
    await searchNotices(pool, {
      page: 2,
      pageSize: 10,
      country: "中国",
      deadlineFrom: "2026-08-01",
      deadlineTo: "2026-08-31",
      deadlineWithinDays: 30,
      noticeType: "tender",
      sort: "latest",
    });

    const countCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("COUNT(DISTINCT n.id)")
    )!;
    const params = countCall[1];
    // 国家精确匹配（不再是 LIKE %...% 包裹）
    expect(params).toContain("中国");
    expect(params).toContain("2026-08-01 00:00:00");
    expect(params).toContain("2026-08-31 23:59:59");
    expect(params).toContain(30);
    expect(params).toContain("%tender%");

    // latest 排序走 n.id DESC；分页 offset = (2-1)*10
    const listCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("SELECT DISTINCT n.id")
    )!;
    expect(String(listCall[0])).toContain("n.id DESC");
    expect(listCall[1].slice(-2)).toEqual([10, 10]);
  });

  it("filters by agency when provided", async () => {
    const pool = makeSearchPool();
    await searchNotices(pool, { page: 1, pageSize: 20, agency: "UNDP" });

    const countCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("COUNT")
    )!;
    expect(String(countCall[0])).toContain("n.agency = ?");
    expect(countCall[1]).toContain("UNDP");
  });

  it("serves identical params from the TTL cache", async () => {
    const pool = makeSearchPool();
    const params = { page: 1, pageSize: 20, q: "缓存专用查询串" };
    const first = await searchNotices(pool, params);
    const callsAfterFirst = pool.query.mock.calls.length;
    const second = await searchNotices(pool, params);

    expect(second).toBe(first);
    expect(pool.query.mock.calls.length).toBe(callsAfterFirst);
  });

  it("degrades silently when annotation queries fail", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (s.includes("COUNT(DISTINCT n.id)")) return [[{ total: 1 }]];
        if (s.includes("SELECT DISTINCT n.id")) {
          return [[{ id: 21, notice_id: "EXT-2", title: "t", description: null }]];
        }
        throw new Error("annotation down");
      }),
    } as any;

    const result = await searchNotices(pool, { page: 1, pageSize: 20, q: "降级测试" });
    expect(result.items[0]).toMatchObject({
      id: 21,
      is_featured: false,
      breakdown_file_count: undefined,
    });
  });
});

// ─── getNoticeCountries / getNoticeStats ────────────────────────────────────
describe("getNoticeCountries / getNoticeStats", () => {
  it("maps countries with numeric counts and caches them", async () => {
    const pool = makeSearchPool();
    const first = await getNoticeCountries(pool);
    expect(first).toEqual([
      { country: "中国", count: 8 },
      { country: "德国", count: 3 },
    ]);

    const callsAfterFirst = pool.query.mock.calls.length;
    const second = await getNoticeCountries(pool);
    expect(second).toBe(first);
    expect(pool.query.mock.calls.length).toBe(callsAfterFirst);
  });

  it("computes pool stats with bridge_gap", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (s.includes("EXISTS (SELECT 1 FROM")) return [[{ total: 60 }]]; // bridged
        if (s.includes("AND EXISTS") === false && s.includes("SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE")) {
          return [[{ total: 80 }]]; // active
        }
        if (s.includes("WHERE (n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts")) {
          return [[{ total: 80 }]];
        }
        if (s.trim() === "SELECT COUNT(*) AS total FROM crm_bid_notices n") return [[{ total: 100 }]];
        if (s.includes("crm_bid_opportunities")) return [[{ total: 5 }]]; // featured
        return [[{ total: 0 }]];
      }),
    } as any;

    const stats = await getNoticeStats(pool);
    expect(stats.raw).toBe(100);
    expect(stats.active).toBe(80);
    expect(stats.bridged).toBe(60);
    expect(stats.bridge_gap).toBe(20);
    expect(typeof stats.featured).toBe("number");
  });
});

// ─── recommendNotices ───────────────────────────────────────────────────────
describe("recommendNotices", () => {
  it("falls back to deadline ordering without a user", async () => {
    const pool = makeSearchPool();
    const result = await recommendNotices(pool as any, "", 1, 20);

    expect(result.fallback).toBe("deadline");
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      match_score: 0,
      reco_score: 0,
      core_locked: true,
      breakdown_file_count: 1,
    });
  });

  it("falls back when the user has no usable interest codes", async () => {
    const pool = makeSearchPool({
      "crm_user_interest_codes": [],
    });
    const result = await recommendNotices(pool as any, "ghost@test.com", 1, 20);
    expect(result.fallback).toBe("deadline");
  });

  it("scores and returns interest-recalled notices with reasons", async () => {
    const pool = makeSearchPool({
      "crm_user_interest_codes": [
        { code: "2300", level: 2, code_id: 55, decayed_weight: 2, last_update: new Date() },
      ],
      "GROUP_CONCAT(DISTINCT b.code)": [
        {
          id: 11, notice_id: "EXT-1", reference: null, title: "工业水泵采购",
          notice_type: "tender", country: "中国", deadline: null, deadline_ts: null,
          estimated_value: null, description: "水泵", documents: null, procurement_files: null,
          l4_hit: 0, amount_usd_cached: null, codes_concat: "23000000",
          match_score: 1, reco_score: 0.52,
        },
      ],
      "crm_reco_weight_profile": [],
      "AVG(LOG10": [{ center_log: 0, cnt: 0 }],
    });

    const result = await recommendNotices(pool as any, "uk@test.com", 1, 20);

    expect(result.fallback).toBeUndefined();
    expect(result.total).toBe(1);
    expect(result.variant).toMatch(/^(control|treatment)$/);
    expect(result.items[0]).toMatchObject({
      id: 11,
      core_locked: true,
      match_score: 1,
    });
    // 无 L4/临期/高价值信号 → 兜底行业匹配原因
    expect(result.items[0].reco_reasons).toEqual(["industry_match"]);
    // 召回条件带桥接表 level2 子句
    const recallCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("COUNT(DISTINCT n.id)")
    )!;
    expect(String(recallCall[0])).toContain("b.level2_id IN (?)");
    expect(recallCall[1]).toEqual([55]);
  });
});
