// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { rollupNoticeViewDaily } from "../../../server/services/amount";

// ─── rollupNoticeViewDaily ─────────────────────────────────────────────────
describe("rollupNoticeViewDaily", () => {
  it("executes full rollup when sinceDays=0", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 42 }]),
    };
    const result = await rollupNoticeViewDaily(dbPool, 0);
    expect(result.affected).toBe(42);
    const [sql, params] = dbPool.query.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO crm_notice_view_daily");
    expect(String(sql)).toContain("GROUP BY notice_id, DATE(viewed_at)");
    expect(String(sql)).not.toContain("INTERVAL");
    expect(params).toEqual([]);
  });

  it("executes incremental rollup with sinceDays window", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 10 }]),
    };
    const result = await rollupNoticeViewDaily(dbPool, 7);
    expect(result.affected).toBe(10);
    const [sql, params] = dbPool.query.mock.calls[0];
    expect(String(sql)).toContain("INTERVAL ? DAY");
    expect(params).toEqual([7]);
  });

  it("handles zero affected rows", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
    };
    const result = await rollupNoticeViewDaily(dbPool);
    expect(result.affected).toBe(0);
  });

  it("uses ON DUPLICATE KEY UPDATE for idempotency", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 5 }]),
    };
    await rollupNoticeViewDaily(dbPool);
    const [sql] = dbPool.query.mock.calls[0];
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(String(sql)).toContain("view_cnt = VALUES(view_cnt)");
  });

  it("counts distinct users for uniq_user_cnt", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    await rollupNoticeViewDaily(dbPool);
    const [sql] = dbPool.query.mock.calls[0];
    expect(String(sql)).toContain("COUNT(DISTINCT user_key)");
  });
});
