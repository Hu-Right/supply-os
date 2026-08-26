/**
 * src/features/procurement/api/membership.ts 测试
 * 验证 re-export 正确转发 membership/api 的导出
 */
import { describe, it, expect } from "vitest";
import { fetchMembershipPlans, fetchMembershipStatus } from "@/features/procurement/api/membership";

describe("procurement/api/membership re-export", () => {
  it("fetchMembershipPlans 为函数", () => {
    expect(typeof fetchMembershipPlans).toBe("function");
  });

  it("fetchMembershipStatus 为函数", () => {
    expect(typeof fetchMembershipStatus).toBe("function");
  });
});
