import { describe, it, expect } from "vitest";
import { extractTierLabel, previewUpgrade } from "@/lib/services/membership-upgrade";
import type { MembershipRepo } from "@/lib/repos/membership.repo";

describe("extractTierLabel", () => {
  it("含连字符 → 取末段", () => {
    expect(extractTierLabel("标讯企业会员-基础版")).toBe("基础版");
    expect(extractTierLabel("标讯企业会员-旗舰版")).toBe("旗舰版");
  });

  it("不含连字符 → 去前缀后缀加 '版'", () => {
    expect(extractTierLabel("标讯个人会员")).toBe("个人版");
  });

  it("null/undefined → VIP", () => {
    expect(extractTierLabel(null)).toBe("VIP");
    expect(extractTierLabel(undefined)).toBe("VIP");
    expect(extractTierLabel("")).toBe("VIP");
  });

  it("纯英文套餐名 → 去标讯/会员后加版", () => {
    expect(extractTierLabel("Enterprise")).toBe("Enterprise版");
  });
});

describe("previewUpgrade", () => {
  function makeMockRepo(data: {
    plan?: { plan_code: string; name: string; price: number; unlock_quota: number; is_active: number } | null;
    currentBest?: {
      plan_code: string; plan_name: string; price: number; unlock_quota: number;
      quota_used: number; started_at: Date | null; expires_at: Date | null;
    } | null;
  }): MembershipRepo {
    return {
      findPlanByCode: async () => data.plan ?? null,
      findCurrentBestPlan: async () => data.currentBest ?? null,
    } as unknown as MembershipRepo;
  }

  it("目标套餐不存在 → TARGET_PLAN_NOT_FOUND", async () => {
    const repo = makeMockRepo({ plan: null });
    const result = await previewUpgrade(repo, 1, "annual");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("TARGET_PLAN_NOT_FOUND");
  });

  it("无活跃套餐 → NO_ACTIVE_PLAN", async () => {
    const repo = makeMockRepo({
      plan: { plan_code: "annual", name: "年费会员", price: 799, unlock_quota: 100, is_active: 1 },
      currentBest: null,
    });
    const result = await previewUpgrade(repo, 1, "annual");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("NO_ACTIVE_PLAN");
  });

  it("已是目标套餐 → ALREADY_ON_TARGET_PLAN", async () => {
    const repo = makeMockRepo({
      plan: { plan_code: "basic", name: "基础版", price: 100, unlock_quota: 10, is_active: 1 },
      currentBest: {
        plan_code: "basic", plan_name: "基础版", price: 100, unlock_quota: 10,
        quota_used: 3, started_at: new Date(), expires_at: null,
      },
    });
    const result = await previewUpgrade(repo, 1, "basic");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("ALREADY_ON_TARGET_PLAN");
  });

  it("降级场景 → CANNOT_DOWNGRADE", async () => {
    const repo = makeMockRepo({
      plan: { plan_code: "basic", name: "基础版", price: 100, unlock_quota: 10, is_active: 1 },
      currentBest: {
        plan_code: "premium", plan_name: "高级版", price: 500, unlock_quota: 50,
        quota_used: 10, started_at: new Date(), expires_at: null,
      },
    });
    const result = await previewUpgrade(repo, 1, "basic");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("CANNOT_DOWNGRADE");
  });

  it("正常升级 → 计算差价和剩余额度", async () => {
    const repo = makeMockRepo({
      plan: { plan_code: "premium", name: "高级版", price: 500, unlock_quota: 50, is_active: 1 },
      currentBest: {
        plan_code: "basic", plan_name: "基础版", price: 100, unlock_quota: 10,
        quota_used: 3, started_at: new Date("2026-01-01"), expires_at: new Date("2026-12-31"),
      },
    });
    const result = await previewUpgrade(repo, 1, "premium");
    expect(result.can_upgrade).toBe(true);
    expect(result.price_difference).toBe(400);
    expect(result.remaining_after_upgrade).toBe(47); // 50 - 3
    expect(result.quota_used).toBe(3);
    expect(result.expires_at_unchanged).toBe(true);
  });
});
