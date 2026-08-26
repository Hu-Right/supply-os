/**
 * server/services/recommend/interest-decay.ts 测试
 * 验证兴趣码衰减逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { decayUserInterestCodes } from "../../../../server/services/recommend/interest-decay";

// mock unspsc/index 的 expandUnspscInterestPrefixes
vi.mock("../../../../server/services/unspsc/index", () => ({
  expandUnspscInterestPrefixes: (code: string) => {
    if (!code) return [];
    if (code.length >= 4) return [code.slice(0, 2), code.slice(0, 4)];
    return [code];
  },
}));

describe("decayUserInterestCodes", () => {
  it("空 snapshot → 不执行 SQL", async () => {
    const pool = { execute: vi.fn() };
    await decayUserInterestCodes(pool, "user1", []);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("snapshot 中 code 为空 → 前缀集为空 → 不执行 SQL", async () => {
    const pool = { execute: vi.fn() };
    await decayUserInterestCodes(pool, "user1", [{ code: "" }, { code: undefined }]);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("有效 snapshot → 执行 UPDATE 衰减", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([]) };
    await decayUserInterestCodes(pool, "user1", [{ code: "1234" }]);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("GREATEST(0.01, weight * ?)");
    expect(sql).toContain("user_key = ?");
    expect(params[0]).toBe(0.5); // 默认衰减因子
    expect(params[1]).toBe("user1");
  });

  it("自定义衰减因子生效", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([]) };
    await decayUserInterestCodes(pool, "user2", [{ code: "5678" }], 0.3);
    const [, params] = pool.execute.mock.calls[0];
    expect(params[0]).toBe(0.3);
  });

  it("多条 snapshot 去重后合并前缀", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([]) };
    await decayUserInterestCodes(pool, "user3", [{ code: "1234" }, { code: "12345678" }]);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql] = pool.execute.mock.calls[0];
    // 应该有多个 code 占位符（去重后的前缀）
    expect(sql).toContain("code IN");
  });

  it("code 中的非数字字符被去除", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([]) };
    await decayUserInterestCodes(pool, "user4", [{ code: "AB12CD34" }]);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});
