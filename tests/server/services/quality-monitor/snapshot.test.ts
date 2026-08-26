/**
 * server/services/quality-monitor/snapshot.ts 测试
 * 验证数据质量快照采集逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { captureDataQualitySnapshot } from "../../../../server/services/quality-monitor/snapshot";

describe("captureDataQualitySnapshot", () => {
  it("执行 3 条查询 + 1 条 UPSERT，返回指标对象", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{
          total_notices: 1000, missing_value: 50, missing_country: 10,
          missing_deadline: 20, expired_but_active: 5,
        }]])
        .mockResolvedValueOnce([[{ unlinked_unspsc: 30 }]])
        .mockResolvedValueOnce([[{ dup_notice_cnt: 3 }]]),
      execute: vi.fn().mockResolvedValue([]),
    };
    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics.total_notices).toBe(1000);
    expect(metrics.missing_value).toBe(50);
    expect(metrics.missing_country).toBe(10);
    expect(metrics.missing_deadline).toBe(20);
    expect(metrics.unlinked_unspsc).toBe(30);
    expect(metrics.expired_but_active).toBe(5);
    expect(metrics.dup_notice_cnt).toBe(3);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  it("UPSERT 使用 ON DUPLICATE KEY UPDATE（幂等）", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total_notices: 0 }]])
        .mockResolvedValueOnce([[{ unlinked_unspsc: 0 }]])
        .mockResolvedValueOnce([[{ dup_notice_cnt: 0 }]]),
      execute: vi.fn(),
    };
    await captureDataQualitySnapshot(pool);
    const [sql] = pool.execute.mock.calls[0];
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  it("空表 → 所有指标为 0", async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total_notices: 0, missing_value: 0, missing_country: 0, missing_deadline: 0, expired_but_active: 0 }]])
        .mockResolvedValueOnce([[{ unlinked_unspsc: 0 }]])
        .mockResolvedValueOnce([[{ dup_notice_cnt: 0 }]]),
      execute: vi.fn(),
    };
    const metrics = await captureDataQualitySnapshot(pool);
    expect(metrics.total_notices).toBe(0);
    expect(metrics.dup_notice_cnt).toBe(0);
  });
});
