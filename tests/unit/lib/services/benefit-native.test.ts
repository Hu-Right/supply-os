import { describe, it, expect, vi } from "vitest";
import { resolveMembershipState } from "@/lib/services/membership-status";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import { readFileSync } from "node:fs";

function catalog(subscription: unknown = null) {
  return {
    findActivePlanForUser: vi.fn().mockResolvedValue(subscription),
    getPlan: vi.fn(async (code: string) => ({ plan_code: code, name_zh: code, price_mode: code === "free" ? "free" : "fixed" })),
    listQuotaBalances: vi.fn().mockResolvedValue([{ benefit_code: "notice_view", quota_total: 10, quota_used: 10, remaining: 0, status: "exhausted" }]),
  };
}

describe("会员原生契约", () => {
  it("未订阅直接取 free，不从旧表计算虚拟额度", async () => {
    const repo = catalog();
    const state = await resolveMembershipState(repo as unknown as BenefitSystemRepo, 7);
    expect(state).toMatchObject({ plan: { plan_code: "free" }, subscription: null });
    expect(repo.listQuotaBalances).toHaveBeenCalledWith(7, null);
    expect(Object.keys(state).sort()).toEqual(["plan", "quotas", "subscription"]);
  });
  it("成员只读所属订阅共享池，耗尽余额不使订阅身份消失", async () => {
    const subscription = { subscription_id: 21, owner_user_id: 4, plan_code: "pro", seat_role: "member" };
    const repo = catalog(subscription);
    const state = await resolveMembershipState(repo as unknown as BenefitSystemRepo, 7);
    expect(state.subscription).toEqual(subscription);
    expect(state.quotas[0]).toMatchObject({ status: "exhausted", remaining: 0 });
    expect(repo.listQuotaBalances).toHaveBeenCalledWith(4, 21);
  });
  it("目录缺失显式报错，不能静默降级免费", async () => {
    const repo = catalog();
    repo.getPlan.mockResolvedValueOnce(null as never);
    await expect(resolveMembershipState(repo as unknown as BenefitSystemRepo, 7)).rejects.toThrow("PLAN_NOT_FOUND");
  });
  it("数据库失败透传，不返回假零余额", async () => {
    const repo = catalog();
    repo.listQuotaBalances.mockRejectedValueOnce(new Error("DB_DOWN"));
    await expect(resolveMembershipState(repo as unknown as BenefitSystemRepo, 7)).rejects.toThrow("DB_DOWN");
  });
});

describe("单轨支付源约束", () => {
  for (const file of ["activate.ts", "upgrade.ts", "reverse.ts", "PaymentService.ts"]) {
    it(`${file} 不允许旧表与旧会员依赖回流`, () => {
      const source = readFileSync(`src/lib/payment/${file}`, "utf8");
      expect(source).not.toMatch(/crm_user_subscriptions|crm_user_entitlements|crm_membership_plans|MembershipRepo/);
    });
  }
});
