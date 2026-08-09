// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { refreshFeaturedColumn } from "../../../server/services/notices";

/** Create a mock pool that routes SQL by content markers */
function createPool(overrides: Record<string, any[]> = {}) {
  return {
    query: vi.fn(async (sql: string, _params?: any[]) => {
      const s = String(sql);
      for (const [marker, rows] of Object.entries(overrides)) {
        if (s.includes(marker)) return [rows];
      }
      return [[]];
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

// ─── refreshFeaturedColumn ─────────────────────────────────────────────────
describe("refreshFeaturedColumn", () => {
  it("returns zeros when no changes needed", async () => {
    const pool = createPool();
    const result = await refreshFeaturedColumn(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([]);
  });

  it("marks notices as featured when they qualify", async () => {
    const pool = createPool({
      "is_featured = 0": [{ id: 1 }, { id: 2 }],
      "is_featured = 1 AND NOT": [],
    });
    const result = await refreshFeaturedColumn(pool);
    expect(result.marked).toBe(2);
    expect(result.unmarked).toBe(0);
    expect(result.changedIds).toEqual([1, 2]);
    // Should have executed an UPDATE
    const updateCall = pool.query.mock.calls.find(
      ([sql]: [string]) => String(sql).includes("UPDATE crm_bid_notices SET is_featured = 1"),
    );
    expect(updateCall).toBeDefined();
  });

  it("unmarks notices that no longer qualify", async () => {
    const pool = createPool({
      "is_featured = 0": [],
      "is_featured = 1 AND NOT": [{ id: 10 }, { id: 11 }],
    });
    const result = await refreshFeaturedColumn(pool);
    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(2);
    expect(result.changedIds).toEqual([10, 11]);
  });

  it("handles both mark and unmark in same run", async () => {
    const pool = createPool({
      "is_featured = 0": [{ id: 1 }],
      "is_featured = 1 AND NOT": [{ id: 2 }],
    });
    const result = await refreshFeaturedColumn(pool);
    expect(result.marked).toBe(1);
    expect(result.unmarked).toBe(1);
    expect(result.changedIds).toEqual([1, 2]);
  });

  it("skips UPDATE when no IDs to change", async () => {
    const pool = createPool();
    await refreshFeaturedColumn(pool);
    const updateCalls = pool.query.mock.calls.filter(
      ([sql]: [string]) => String(sql).includes("UPDATE crm_bid_notices SET is_featured"),
    );
    expect(updateCalls).toHaveLength(0);
  });
});
