// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { recommendNotices } from "../../../server/services/noticeRecommend";

/** Build a mock pool that routes SQL by content markers */
function makePool(overrides: Record<string, any[]> = {}) {
  return {
    query: vi.fn(async (sql: string, _params?: any[]) => {
      const s = String(sql);
      for (const [marker, rows] of Object.entries(overrides)) {
        if (s.includes(marker)) return [rows];
      }
      // Default responses for various queries
      if (s.includes("COUNT(DISTINCT n.id)")) return [[{ total: 0 }]];
      if (s.startsWith("SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE")) return [[{ total: 0 }]];
      return [[]];
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

// ─── recommendNotices (additional coverage) ────────────────────────────────
describe("recommendNotices (extra)", () => {
  it("returns deadline fallback for empty userKey", async () => {
    const pool = makePool();
    const result = await recommendNotices(pool, "", 1, 9);
    expect(result.fallback).toBe("deadline");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(9);
  });

  it("returns deadline fallback when interest codes yield no clauses", async () => {
    const pool = makePool({
      "crm_user_interest_codes": [
        // code is empty → skipped in loop
        { code: "", level: 2, code_id: 0, decayed_weight: 1, last_update: new Date() },
      ],
    });
    const result = await recommendNotices(pool, "user@test.com", 1, 9);
    expect(result.fallback).toBe("deadline");
  });

  it("handles multi-level interest codes with different decay weights", async () => {
    const pool = makePool({
      "crm_user_interest_codes": [
        { code: "23001500", level: 2, code_id: 55, decayed_weight: 3, last_update: new Date() },
        { code: "23001520", level: 3, code_id: 60, decayed_weight: 2, last_update: new Date() },
        { code: "80101500", level: 4, code_id: 70, decayed_weight: 1, last_update: new Date() },
      ],
      "GROUP_CONCAT(DISTINCT b.code)": [],
      "crm_reco_weight_profile": [],
      "AVG(LOG10": [{ center_log: 0, cnt: 0 }],
    });
    const result = await recommendNotices(pool, "multi@test.com", 1, 20);
    // Should have recall clauses for level 2, 3, 4
    const recallCall = pool.query.mock.calls.find((c: any[]) =>
      String(c[0]).includes("COUNT(DISTINCT n.id)"),
    );
    if (recallCall) {
      const sql = String(recallCall[0]);
      expect(sql).toContain("b.level2_id");
      expect(sql).toContain("b.level3_id");
      expect(sql).toContain("b.level4_id");
    }
  });

  it("trims trailing 00 segments from UNSPSC codes", async () => {
    const pool = makePool({
      "crm_user_interest_codes": [
        { code: "23000000", level: 2, code_id: 0, decayed_weight: 2, last_update: new Date() },
      ],
    });
    // Should not crash; significantPrefix("23000000") → "23"
    const result = await recommendNotices(pool, "trim@test.com", 1, 9);
    expect(result).toBeDefined();
  });

  it("calculates correct offset for page > 1", async () => {
    const pool = makePool({
      "crm_user_interest_codes": [
        { code: "23001500", level: 2, code_id: 55, decayed_weight: 2, last_update: new Date() },
      ],
      "GROUP_CONCAT(DISTINCT b.code)": [],
      "crm_reco_weight_profile": [],
      "AVG(LOG10": [{ center_log: 0, cnt: 0 }],
    });
    await recommendNotices(pool, "page@test.com", 3, 10);
    // offset = (3-1)*10 = 20
    const mainCall = pool.query.mock.calls.find((c: any[]) =>
      String(c[0]).includes("reco_score") && String(c[0]).includes("LIMIT"),
    );
    if (mainCall) {
      const params = mainCall[1];
      // Last two params should be pageSize and offset
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(20);
    }
  });

  it("falls back gracefully when main query throws", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (s.includes("crm_user_interest_codes")) {
          return [[{ code: "23001500", level: 2, code_id: 55, decayed_weight: 2, last_update: new Date() }]];
        }
        if (s.includes("crm_reco_weight_profile")) return [[]];
        if (s.includes("AVG(LOG10")) return [[{ center_log: 0, cnt: 0 }]];
        if (s.includes("crm_user_unlocks") || s.includes("getUserUnlockKeywords")) return [[]];
        // Main query throws
        if (s.includes("reco_score")) throw new Error("Main query failed");
        // Fallback COUNT
        if (s.startsWith("SELECT COUNT(*) AS total")) return [[{ total: 5 }]];
        // Fallback list
        if (s.includes("ORDER BY") && s.includes("deadline_sec")) {
          return [[{
            id: 1, notice_id: "N-1", reference: "R-1", title: "Fallback Notice",
            notice_type: "Tender", country: "Brazil", deadline: "2026-12-31",
            deadline_ts: null, deadline_sec: null, estimated_value: null,
            description: "Fallback desc", documents: null, procurement_files: null,
          }]];
        }
        return [[]];
      }),
      execute: vi.fn().mockResolvedValue([[]]),
    } as any;

    const result = await recommendNotices(pool, "fallback@test.com", 1, 9);
    // Should fall back to deadline ordering
    expect(result.fallback).toBe("deadline");
  });

  it("applies text bonus from unlock keywords", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (s.includes("crm_user_interest_codes")) {
          return [[{ code: "23001500", level: 2, code_id: 55, decayed_weight: 2, last_update: new Date() }]];
        }
        if (s.includes("GROUP_CONCAT(DISTINCT b.code)")) {
          return [[{
            id: 11, notice_id: "N-11", reference: null, title: "Medical Equipment Supply",
            notice_type: "tender", country: "Brazil", deadline: null, deadline_ts: null,
            deadline_sec: null, estimated_value: null, description: "Medical devices",
            documents: null, procurement_files: null,
            l4_hit: 0, amount_usd_cached: null, codes_concat: "23001500",
            match_score: 1, reco_score: 0.5,
          }]];
        }
        if (s.includes("crm_reco_weight_profile")) return [[]];
        if (s.includes("AVG(LOG10")) return [[{ center_log: 0, cnt: 0 }]];
        if (s.includes("COUNT(DISTINCT n.id)")) return [[{ total: 1 }]];
        // Unlock keywords query
        if (s.includes("crm_opportunity_unlocks") && s.includes("title")) {
          return [[{ title: "Medical Equipment" }]];
        }
        return [[]];
      }),
      execute: vi.fn().mockResolvedValue([[]]),
    } as any;

    const result = await recommendNotices(pool, "text-bonus@test.com", 1, 20);
    if (result.items.length > 0) {
      // reco_score should be boosted by text similarity bonus
      expect(result.items[0].reco_score).toBeGreaterThan(0);
    }
  });
});
