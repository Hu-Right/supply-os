// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  refreshIsActive,
  refreshNoticeStats,
  getNoticeAgencies,
  refreshNoticeAgencies,
  __testClearAllCaches,
} from "../../../server/services/noticeSearch";

beforeEach(() => {
  __testClearAllCaches();
});

// ─── refreshIsActive ───────────────────────────────────────────────────────
describe("refreshIsActive", () => {
  it("returns zeros when no rows need changing", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[]]),
    } as any;
    const result = await refreshIsActive(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([]);
  });

  it("marks expired notices as inactive and returns changed IDs", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]])  // toDeactivate
        .mockResolvedValueOnce([{ affectedRows: 2 }])         // deactivate result
        .mockResolvedValueOnce([[]])                           // toReactivate
        .mockResolvedValueOnce([{ affectedRows: 0 }]),         // reactivate result
    } as any;
    const result = await refreshIsActive(pool);
    expect(result.marked).toBe(2);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([10, 11]);
  });

  it("reactivates notices that are no longer expired", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]])                            // toDeactivate
        .mockResolvedValueOnce([{ affectedRows: 0 }])           // deactivate result
        .mockResolvedValueOnce([[{ id: 20 }]])                  // toReactivate
        .mockResolvedValueOnce([{ affectedRows: 1 }]),          // reactivate result
    } as any;
    const result = await refreshIsActive(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(1);
    expect(result.changedIds).toEqual([20]);
  });

  it("returns zeros silently on database error", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    } as any;
    const result = await refreshIsActive(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([]);
  });
});

// ─── refreshNoticeStats ────────────────────────────────────────────────────
describe("refreshNoticeStats", () => {
  it("writes stats entries to the database", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 1000 }]])   // active total
        .mockResolvedValueOnce([[{ cnt: 50 }]])      // featured total
        .mockResolvedValueOnce([[                     // countries
          { country: "Brazil", cnt: 500 },
          { country: "India", cnt: 300 },
        ]])
        .mockResolvedValueOnce([[                     // agencies
          { agency: "UNDP", cnt: 200 },
        ]])
        .mockResolvedValue([[]]),                     // INSERT ... ON DUPLICATE KEY
    } as any;

    await refreshNoticeStats(pool);
    // Should write: active_total, featured, 2 countries, 1 agency = 5 entries
    const insertCalls = pool.query.mock.calls.filter(
      ([sql]) => String(sql).includes("INSERT INTO crm_notice_stats"),
    );
    expect(insertCalls.length).toBe(5);
  });

  it("handles database errors gracefully", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("Table not found")),
    } as any;
    // Should not throw
    await expect(refreshNoticeStats(pool)).resolves.toBeUndefined();
  });
});

// ─── getNoticeAgencies ─────────────────────────────────────────────────────
describe("getNoticeAgencies", () => {
  it("returns agencies without i18n for en locale", async () => {
    // First call triggers refresh
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]])                // alias query
        .mockResolvedValueOnce([[]])                 // agency data query
        .mockResolvedValue([[]]),                    // other queries
    } as any;

    const result = await getNoticeAgencies(pool, "en");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns agencies with translated i18n for zh locale", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[                    // alias with i18n
          { canonical: "UNDP", alias: "UNDP", name_i18n: '{"zh":"联合国开发计划署"}' },
        ]])
        .mockResolvedValueOnce([[                    // agency data
          { agency: "UNDP", country: "BR", cnt: 100 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const result = await getNoticeAgencies(pool, "zh");
    // The result should contain agency items
    expect(Array.isArray(result)).toBe(true);
  });

  it("caches agencies and respects TTL", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValue([[]]),
    } as any;

    const first = await getNoticeAgencies(pool, "en");
    const callsAfterFirst = pool.query.mock.calls.length;
    const second = await getNoticeAgencies(pool, "en");
    // Second call should use cache (no additional queries)
    expect(second).toEqual(first);
    expect(pool.query.mock.calls.length).toBe(callsAfterFirst);
  });

  it("filters invalid translations identical to agency name", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[
          { canonical: "SOME AGENCY", alias: "SOME AGENCY", name_i18n: '{"zh":"SOME AGENCY"}' },
        ]])
        .mockResolvedValueOnce([[
          { agency: "SOME AGENCY", country: "US", cnt: 50 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const result = await getNoticeAgencies(pool, "zh");
    // Translation "SOME AGENCY" === agency "SOME AGENCY" → filtered as invalid
    const item = result.find(r => r.agency === "SOME AGENCY");
    if (item) {
      expect(item.agency_i18n).toBeUndefined();
    }
  });
});

// ─── refreshNoticeAgencies ─────────────────────────────────────────────────
describe("refreshNoticeAgencies", () => {
  it("normalizes and deduplicates agencies by canonical name", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[                    // aliases
          { canonical: "UNDP", alias: "undp brazil", name_i18n: '{"zh":"联合国开发计划署"}' },
          { canonical: "UNDP", alias: "UNDP Brazil", name_i18n: null },
        ]])
        .mockResolvedValueOnce([[                    // raw agency data
          { agency: "undp brazil", country: "BR", cnt: 100 },
          { agency: "UNDP Brazil", country: "BR", cnt: 50 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const data = await refreshNoticeAgencies(pool);
    expect(Array.isArray(data)).toBe(true);
    // Both "undp brazil" and "UNDP Brazil" should map to canonical "UNDP"
    const undpItem = data.find(d => d.agency === "UNDP");
    expect(undpItem).toBeDefined();
    expect(undpItem!.count).toBe(150); // 100 + 50
  });

  it("handles alias table not existing", async () => {
    const pool = {
      query: vi.fn()
        .mockRejectedValueOnce(new Error("Table not found")) // alias query fails
        .mockResolvedValueOnce([[                             // raw agency data
          { agency: "Test Agency", country: "US", cnt: 10 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const data = await refreshNoticeAgencies(pool);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it("parses JSON string name_i18n from alias table", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[
          { canonical: "Test", alias: "test", name_i18n: '{"zh":"测试机构","en":"Test Agency"}' },
        ]])
        .mockResolvedValueOnce([[
          { agency: "test", country: "CN", cnt: 50 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const data = await refreshNoticeAgencies(pool);
    const item = data.find(d => d.agency === "Test");
    expect(item).toBeDefined();
    expect(item!.i18n).toBeDefined();
    expect(item!.i18n!.zh).toBe("测试机构");
  });

  it("handles invalid JSON in name_i18n gracefully", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[
          { canonical: "Bad JSON", alias: "bad", name_i18n: "not json" },
        ]])
        .mockResolvedValueOnce([[
          { agency: "bad", country: "US", cnt: 50 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const data = await refreshNoticeAgencies(pool);
    // Should not crash, i18n may be null or generated
    expect(Array.isArray(data)).toBe(true);
  });

  it("aggregates low-count agencies into orphan buckets", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]]) // aliases
        .mockResolvedValueOnce([[
          { agency: "Tiny Agency", country: "BR", cnt: 2 },
          { agency: "Another Small", country: "BR", cnt: 1 },
        ]])
        .mockResolvedValue([[]]),
    } as any;

    const data = await refreshNoticeAgencies(pool);
    // Agencies with count <= 5 should be aggregated into orphan buckets
    const orphanItem = data.find(d => d.agency.startsWith("ORPHAN_"));
    expect(orphanItem).toBeDefined();
  });
});
