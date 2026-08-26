/**
 * server/services/data-cleanup/engine.ts 测试
 * 验证脏数据清理引擎：countStaleData + runStaleDataCleanup
 */
import { describe, it, expect, vi } from "vitest";
import { countStaleData, runStaleDataCleanup, type CleanupTarget } from "../../../../server/services/data-cleanup/engine";

const mockTarget: CleanupTarget = {
  table: "crm_notice_unspsc_codes",
  idColumn: "id",
  joinColumn: "notice_id",
  mainJoinColumn: "notice_id",
  backupPrefix: "backup_stale_codes",
};

function createMockPool(options: {
  total?: number;
  staleData?: any[];
  deleteAffected?: number;
} = {}) {
  const { total = 1000, staleData = [], deleteAffected = 0 } = options;
  const queryFn = vi.fn()
    // COUNT(*) → tableTotal
    .mockResolvedValueOnce([[{ cnt: total }]])
    // LEFT JOIN stale data query
    .mockResolvedValueOnce([staleData]);
  return { query: queryFn } as any;
}

describe("countStaleData", () => {
  it("无脏数据 → 返回零", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 1000 }]])
        .mockResolvedValueOnce([[{ orphan_rows: 0, expired_rows: 0 }]]),
    } as any;
    const result = await countStaleData(pool, mockTarget);
    expect(result.tableTotal).toBe(1000);
    expect(result.orphanRows).toBe(0);
    expect(result.expiredRows).toBe(0);
  });

  it("有孤儿数据 → 正确统计", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 500 }]])
        .mockResolvedValueOnce([[{ orphan_rows: 50, expired_rows: 30 }]]),
    } as any;
    const result = await countStaleData(pool, mockTarget);
    expect(result.tableTotal).toBe(500);
    expect(result.orphanRows).toBe(50);
    expect(result.expiredRows).toBe(30);
  });

  it("includeExpired=true → WHERE 条件包含 is_expired", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 500 }]])
        .mockResolvedValueOnce([[{ orphan_rows: 50, expired_rows: 30 }]]),
    } as any;
    await countStaleData(pool, mockTarget, true);
    // 第二次查询应包含 is_expired 条件
    const secondCall = pool.query.mock.calls[1][0];
    expect(secondCall).toContain("is_expired");
  });
});

describe("runStaleDataCleanup", () => {
  it("无脏数据 → 不删除不备份", async () => {
    const pool = createMockPool({ total: 1000, staleData: [] });
    const logger = { info: vi.fn() };
    const result = await runStaleDataCleanup(pool, mockTarget, {}, logger);
    expect(result.deleted).toBe(0);
    expect(result.backupTable).toBeNull();
    expect(result.tableTotal).toBe(1000);
    expect(result.orphanRows).toBe(0);
  });

  it("有脏数据 + backup → 创建备份表 + 分批删除", async () => {
    const staleData = [
      { target_id: 1, orphan_rows: 3, expired_rows: 0 },
      { target_id: 2, orphan_rows: 3, expired_rows: 0 },
      { target_id: 3, orphan_rows: 3, expired_rows: 0 },
    ];
    const pool = {
      query: vi.fn()
        // COUNT(*)
        .mockResolvedValueOnce([[{ cnt: 100 }]])
        // stale data query
        .mockResolvedValueOnce([staleData])
        // backup table existence check
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        // CREATE TABLE backup
        .mockResolvedValueOnce([{}])
        // DELETE batch
        .mockResolvedValueOnce([{ affectedRows: 3 }]),
    } as any;
    const logger = { info: vi.fn() };
    const result = await runStaleDataCleanup(pool, mockTarget, { backup: true }, logger);
    expect(result.deleted).toBe(3);
    expect(result.backupTable).toContain("backup_stale_codes_");
    expect(result.orphanRows).toBe(3);
    // 验证 logger 被调用
    expect(logger.info).toHaveBeenCalled();
  });

  it("backup=false → 不创建备份表", async () => {
    const staleData = [{ target_id: 1, orphan_rows: 1, expired_rows: 0 }];
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 50 }]])
        .mockResolvedValueOnce([staleData])
        // DELETE batch
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    } as any;
    const result = await runStaleDataCleanup(pool, mockTarget, { backup: false });
    expect(result.backupTable).toBeNull();
    expect(result.deleted).toBe(1);
  });

  it("includeExpired=true → toDelete 包含 expired", async () => {
    const staleData = [
      { target_id: 1, orphan_rows: 2, expired_rows: 5 },
    ];
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 100 }]])
        .mockResolvedValueOnce([staleData])
        .mockResolvedValueOnce([[{ cnt: 0 }]]) // backup check
        .mockResolvedValueOnce([{}]) // CREATE backup
        .mockResolvedValueOnce([{ affectedRows: 1 }]), // DELETE
    } as any;
    const result = await runStaleDataCleanup(pool, mockTarget, { includeExpired: true });
    expect(result.toDelete).toBe(7); // 2 orphan + 5 expired
  });

  it("batchSize 控制分批大小", async () => {
    const staleData = Array.from({ length: 5 }, (_, i) => ({
      target_id: i + 1, orphan_rows: 5, expired_rows: 0,
    }));
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ cnt: 100 }]])
        .mockResolvedValueOnce([staleData])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([{}])
        // 3 批删除（batchSize=2）
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    } as any;
    const result = await runStaleDataCleanup(pool, mockTarget, { batchSize: 2 });
    expect(result.deleted).toBe(5);
    // 3 次 DELETE 调用
    expect(pool.query).toHaveBeenCalledTimes(7); // 2 setup + 1 backup check + 1 create + 3 delete
  });
});
