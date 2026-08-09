// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { captureDataQualitySnapshot } from "../../../server/services/quality";

function createMockPool() {
  const queryResults: any[][] = [
    // baseRows
    [{ total_notices: 1000, missing_value: 50, missing_country: 20, missing_deadline: 10, expired_but_active: 5 }],
    // unlinkedRows
    [{ unlinked_unspsc: 100 }],
    // dupRows
    [{ dup_notice_cnt: 3 }],
  ];
  let queryCallIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[queryCallIndex] || [];
      queryCallIndex++;
      return Promise.resolve([result]);
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe("captureDataQualitySnapshot", () => {
  it("captures snapshot metrics", async () => {
    const pool = createMockPool();
    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics.total_notices).toBe(1000);
    expect(metrics.missing_value).toBe(50);
    expect(metrics.missing_country).toBe(20);
    expect(metrics.missing_deadline).toBe(10);
    expect(metrics.unlinked_unspsc).toBe(100);
    expect(metrics.expired_but_active).toBe(5);
    expect(metrics.dup_notice_cnt).toBe(3);
  });

  it("executes upsert query", async () => {
    const pool = createMockPool();
    await captureDataQualitySnapshot(pool);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO crm_data_quality_snapshot"),
      expect.any(Array)
    );
  });

  it("handles empty query results", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics.total_notices).toBe(0);
    expect(metrics.missing_value).toBe(0);
  });

  it("runs 3 queries (base, unlinked, dup)", async () => {
    const pool = createMockPool();
    await captureDataQualitySnapshot(pool);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
