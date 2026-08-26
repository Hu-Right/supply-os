/**
 * server/services/data-cleanup/engine.ts 测试
 * 验证通用脏数据清理引擎的统计逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { countStaleData } from "../../../../server/services/data-cleanup/engine";

describe("countStaleData", () => {
  it("执行 2 条统计查询并返回结果", async () => {
    const pool = {
      query: vi.fn()
        // 第 1 条：总行数 COUNT(*)
        .mockResolvedValueOnce([[{ cnt: 100 }]])
        // 第 2 条：孤儿+过期统计
        .mockResolvedValueOnce([[{ orphan_rows: 10, expired_rows: 5 }]]),
    };
    const result = await countStaleData(pool as any, {
      table: "crm_notice_unspsc_codes",
      idColumn: "id",
      joinColumn: "notice_id",
      mainJoinColumn: "id",
      backupPrefix: "backup_unspsc",
    });
    expect(result.tableTotal).toBe(100);
    expect(result.orphanRows).toBe(10);
    expect(result.expiredRows).toBe(5);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("第 1 条查询为 COUNT(*) 全表统计", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 50 }]])
        .mockResolvedValueOnce([[{ orphan_rows: 0, expired_rows: 0 }]]),
    };
    await countStaleData(pool as any, {
      table: "test_table", idColumn: "id", joinColumn: "notice_id",
      mainJoinColumn: "id", backupPrefix: "backup",
    });
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain("test_table");
  });

  it("第 2 条查询为 LEFT JOIN 孤儿检测", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 50 }]])
        .mockResolvedValueOnce([[{ orphan_rows: 0, expired_rows: 0 }]]),
    };
    await countStaleData(pool as any, {
      table: "test_table", idColumn: "id", joinColumn: "notice_id",
      mainJoinColumn: "id", backupPrefix: "backup",
    });
    const [sql] = pool.query.mock.calls[1];
    expect(sql).toContain("LEFT JOIN");
    expect(sql).toContain("orphan_rows");
  });

  it("空表 → 所有指标为 0", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ orphan_rows: null, expired_rows: null }]]),
    };
    const result = await countStaleData(pool as any, {
      table: "empty_table", idColumn: "id", joinColumn: "notice_id",
      mainJoinColumn: "id", backupPrefix: "backup",
    });
    expect(result.tableTotal).toBe(0);
    expect(result.orphanRows).toBe(0);
    expect(result.expiredRows).toBe(0);
  });
});
