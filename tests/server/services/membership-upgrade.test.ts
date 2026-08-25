/**
 * server/services/membership-upgrade.ts 测试
 */
import { describe, it, expect, vi } from "vitest";
import { extractTierLabel, previewUpgrade } from "../../../server/services/membership-upgrade";

describe("extractTierLabel", () => {
  it("null/undefined 返回 VIP", () => {
    expect(extractTierLabel(null)).toBe("VIP");
    expect(extractTierLabel(undefined)).toBe("VIP");
    expect(extractTierLabel("")).toBe("VIP");
  });

  it("含连字符取末段", () => {
    expect(extractTierLabel("标讯企业会员-旗舰版")).toBe("旗舰版");
    expect(extractTierLabel("plan-premium")).toBe("premium");
  });

  it("不含连字符去前后缀加版", () => {
    expect(extractTierLabel("标讯个人会员")).toBe("个人版");
    expect(extractTierLabel("标讯基础会员")).toBe("基础版");
  });

  it("无法匹配时兜底 VIP", () => {
    expect(extractTierLabel("标讯会员")).toBe("VIP");
  });
});

describe("previewUpgrade", () => {
  function makeRepo(overrides: {
    findPlanByCode?: any;
    findCurrentBestPlan?: any;
  }) {
    return {
      findPlanByCode: vi.fn().mockResolvedValue(overrides.findPlanByCode ?? null),
      findCurrentBestPlan: vi.fn().mockResolvedValue(overrides.findCurrentBestPlan ?? null),
    } as any;
  }

  it("目标套餐不存在", async () => {
    const repo = makeRepo({});
    const result = await previewUpgrade(repo, "user-1", "nonexistent");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("TARGET_PLAN_NOT_FOUND");
  });

  it("目标套餐不可升级（quota=0）", async () => {
    const repo = makeRepo({ findPlanByCode: { plan_code: "basic", unlock_quota: 0, price: 100 } });
    const result = await previewUpgrade(repo, "user-1", "basic");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("TARGET_PLAN_NOT_UPGRADABLE");
  });

  it("无当前套餐", async () => {
    const repo = makeRepo({
      findPlanByCode: { plan_code: "premium", unlock_quota: 100, price: 500, name: "Premium" },
    });
    const result = await previewUpgrade(repo, "user-1", "premium");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("NO_ACTIVE_PLAN");
  });

  it("已在目标套餐", async () => {
    const repo = makeRepo({
      findPlanByCode: { plan_code: "premium", unlock_quota: 100, price: 500, name: "Premium" },
      findCurrentBestPlan: { plan_code: "premium", price: 500, plan_name: "Premium", unlock_quota: 100, quota_used: 5 },
    });
    const result = await previewUpgrade(repo, "user-1", "premium");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("ALREADY_ON_TARGET_PLAN");
  });

  it("不能降级", async () => {
    const repo = makeRepo({
      findPlanByCode: { plan_code: "basic", unlock_quota: 10, price: 100, name: "Basic" },
      findCurrentBestPlan: { plan_code: "premium", price: 500, plan_name: "Premium", unlock_quota: 100, quota_used: 5 },
    });
    const result = await previewUpgrade(repo, "user-1", "basic");
    expect(result.can_upgrade).toBe(false);
    expect(result.reason).toBe("CANNOT_DOWNGRADE");
  });

  it("正常升级预览", async () => {
    const repo = makeRepo({
      findPlanByCode: { plan_code: "ultimate", unlock_quota: 500, price: 1000, name: "Ultimate" },
      findCurrentBestPlan: {
        plan_code: "premium", price: 500, plan_name: "Premium", unlock_quota: 100,
        quota_used: 20, started_at: "2026-01-01", expires_at: "2026-12-31",
      },
    });
    const result = await previewUpgrade(repo, "user-1", "ultimate");
    expect(result.can_upgrade).toBe(true);
    expect(result.price_difference).toBe(500);
    expect(result.quota_used).toBe(20);
    expect(result.remaining_after_upgrade).toBe(480);
    expect(result.expires_at_unchanged).toBe(true);
  });
});
