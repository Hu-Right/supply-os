/**
 * UsersRepo.create 注册类型默认值测试
 * @module tests/unit/lib/repos/users-repo-create.test.ts
 * @description 注册 KPI「个人起步 · 认证转企业」：新用户 user_type 一律默认 personal，
 *              认证通过后由后台翻转。防止回归到旧的 "enterprise" 默认值。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersRepo } from "@/lib/repos/users.repo";

describe("UsersRepo.create 注册类型默认值", () => {
  const mockExecute = vi.fn();
  const mockPool = { execute: mockExecute } as any;

  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([{ insertId: 99 }]);
  });

  it("未显式传 user_type → 默认 personal（注册 KPI「个人起步」口径）", async () => {
    const repo = new UsersRepo(mockPool);
    await repo.create({ email: null, display_name: "T", password_hash: "h" });
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("user_type");
    expect((params as unknown[])[5]).toBe("personal");
  });

  it("显式传入 user_type 时按传入值落库", async () => {
    const repo = new UsersRepo(mockPool);
    await repo.create({ email: null, display_name: "T", password_hash: "h", user_type: "enterprise" });
    const params = mockExecute.mock.calls[0][1] as unknown[];
    expect(params[5]).toBe("enterprise");
  });
});
