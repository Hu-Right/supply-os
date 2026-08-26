/**
 * server/services/amount/cache-backfill.ts 测试
 * 验证金额缓存回填服务
 */
import { describe, it, expect, vi } from "vitest";
import { backfillNoticeAmountCache } from "../../../../server/services/amount/cache-backfill";

function createMockPool(rows: any[] = []) {
  return {
    query: vi.fn()
      .mockResolvedValueOnce([rows])   // SELECT 查询
      .mockResolvedValueOnce([{}]),     // INSERT 写入
  };
}

describe("backfillNoticeAmountCache", () => {
  it("无待回填行 → 返回 { processed: 0 }", async () => {
    const pool = createMockPool([]);
    const result = await backfillNoticeAmountCache(pool);
    expect(result).toEqual({ processed: 0 });
    // 只调用了 SELECT，没有 INSERT
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("有待回填行 → 解析并批量写入", async () => {
    const pool = createMockPool([
      { id: 1, estimated_value: "USD 50000", country: "US" },
      { id: 2, estimated_value: "EUR 30000", country: "DE" },
    ]);
    const result = await backfillNoticeAmountCache(pool);
    expect(result).toEqual({ processed: 2 });
    // SELECT + INSERT
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("指定 noticeIds 时 SQL 包含 IN 过滤", async () => {
    const pool = createMockPool([]);
    await backfillNoticeAmountCache(pool, [10, 20, 30]);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("IN (?,?,?)");
    expect(params).toContain(10);
    expect(params).toContain(20);
    expect(params).toContain(30);
  });

  it("不指定 noticeIds 时 SQL 无 IN 过滤", async () => {
    const pool = createMockPool([]);
    await backfillNoticeAmountCache(pool);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).not.toContain("IN (");
  });

  it("batchLimit 默认 2000", async () => {
    const pool = createMockPool([]);
    await backfillNoticeAmountCache(pool);
    const [, params] = pool.query.mock.calls[0];
    // 最后一个参数应为 batchLimit
    expect(params[params.length - 1]).toBe(2000);
  });

  it("自定义 batchLimit 生效", async () => {
    const pool = createMockPool([]);
    await backfillNoticeAmountCache(pool, undefined, 500);
    const [, params] = pool.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(500);
  });

  it("INSERT SQL 使用 ON DUPLICATE KEY UPDATE（幂等）", async () => {
    const pool = createMockPool([
      { id: 1, estimated_value: "100000", country: "CN" },
    ]);
    await backfillNoticeAmountCache(pool);
    const [insertSql] = pool.query.mock.calls[1];
    expect(insertSql).toContain("ON DUPLICATE KEY UPDATE");
  });
});
