/**
 * server/services/amount/view-rollup.ts 测试
 * 验证浏览量日汇总服务
 */
import { describe, it, expect, vi } from "vitest";
import { rollupNoticeViewDaily } from "../../../../server/services/amount/view-rollup";

function createMockPool(affectedRows = 10) {
  return {
    query: vi.fn().mockResolvedValue([{ affectedRows }]),
  };
}

describe("rollupNoticeViewDaily", () => {
  it("全量模式（sinceDays=0）不传窗口参数", async () => {
    const pool = createMockPool(5);
    const result = await rollupNoticeViewDaily(pool);
    expect(result).toEqual({ affected: 5 });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO crm_notice_view_daily");
    expect(sql).not.toContain("INTERVAL");
    expect(params).toEqual([]);
  });

  it("增量模式（sinceDays>0）传递窗口参数", async () => {
    const pool = createMockPool(3);
    const result = await rollupNoticeViewDaily(pool, 7);
    expect(result).toEqual({ affected: 3 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INTERVAL ? DAY");
    expect(params).toEqual([7]);
  });

  it("affectedRows 为 0 时返回 { affected: 0 }", async () => {
    const pool = createMockPool(0);
    const result = await rollupNoticeViewDaily(pool);
    expect(result).toEqual({ affected: 0 });
  });

  it("SQL 包含 ON DUPLICATE KEY UPDATE（幂等写入）", async () => {
    const pool = createMockPool();
    await rollupNoticeViewDaily(pool);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  it("SQL 统计 DISTINCT user_key（去重计数）", async () => {
    const pool = createMockPool();
    await rollupNoticeViewDaily(pool);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("COUNT(DISTINCT user_key)");
  });
});
