/**
 * server/services/search-orchestrator/reference-fast-path.ts 测试
 * 验证参考号精确匹配快速路径
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../../server/services/search-sync/index", () => ({
  isWideTableReady: vi.fn().mockResolvedValue(true),
}));

import { referenceFastPath } from "../../../../server/services/search-orchestrator/reference-fast-path";
import { isWideTableReady } from "../../../../server/services/search-sync/index";

describe("referenceFastPath", () => {
  it("空查询 → 返回 null", async () => {
    const pool = { query: vi.fn() };
    expect(await referenceFastPath(pool as any, "  ")).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("宽表未就绪 → 返回 null", async () => {
    vi.mocked(isWideTableReady).mockResolvedValueOnce(false);
    const pool = { query: vi.fn() };
    expect(await referenceFastPath(pool as any, "REF-001")).toBeNull();
  });

  it("命中 → 返回公告 ID", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ id: 42 }]]),
    };
    const result = await referenceFastPath(pool as any, "REF-001");
    expect(result).toBe(42);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("reference = ?");
    expect(params).toEqual(["REF-001"]);
  });

  it("未命中 → 返回 null", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[]]),
    };
    const result = await referenceFastPath(pool as any, "NOT-EXIST");
    expect(result).toBeNull();
  });

  it("查询异常 → 返回 null（不抛出）", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const result = await referenceFastPath(pool as any, "REF-ERR");
    expect(result).toBeNull();
  });

  it("自动 trim 输入", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[{ id: 1 }]]),
    };
    await referenceFastPath(pool as any, "  REF-TRIM  ");
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["REF-TRIM"]);
  });
});
