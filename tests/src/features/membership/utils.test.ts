/**
 * src/features/membership/utils.ts 测试
 */
import { describe, it, expect } from "vitest";
import {
  extractTierLabel,
  getGridCols,
  splitDescription,
  getPlanFeatures,
  formatQuota,
  PLAN_CONFIG,
  ORIGINAL_PRICES,
} from "../../../../src/features/membership/utils";
import type { MembershipPlan } from "@/types";

describe("extractTierLabel", () => {
  it("空值返回 VIP", () => {
    expect(extractTierLabel(null)).toBe("VIP");
    expect(extractTierLabel(undefined)).toBe("VIP");
    expect(extractTierLabel("")).toBe("VIP");
  });

  it("含连字符取末段", () => {
    expect(extractTierLabel("标讯企业会员-基础版")).toBe("基础版");
    expect(extractTierLabel("标讯企业会员-旗舰版")).toBe("旗舰版");
  });

  it("不含连字符去前后缀加'版'", () => {
    expect(extractTierLabel("标讯个人会员")).toBe("个人版");
  });

  it("无法匹配返回 VIP", () => {
    expect(extractTierLabel("标讯会员")).toBe("VIP");
  });
});

describe("getGridCols", () => {
  it("1 个", () => {
    expect(getGridCols(1)).toContain("grid-cols-1");
  });

  it("2 个", () => {
    expect(getGridCols(2)).toContain("sm:grid-cols-2");
  });

  it("3 个", () => {
    expect(getGridCols(3)).toContain("lg:grid-cols-3");
  });

  it("4 个", () => {
    expect(getGridCols(4)).toContain("lg:grid-cols-4");
  });

  it("5+ 个", () => {
    expect(getGridCols(5)).toContain("xl:grid-cols-5");
    expect(getGridCols(10)).toContain("xl:grid-cols-5");
  });
});

describe("splitDescription", () => {
  it("空值返回空数组", () => {
    expect(splitDescription(undefined)).toEqual([]);
    expect(splitDescription("")).toEqual([]);
  });

  it("按编号分割", () => {
    const result = splitDescription("②第一项③第二项④第三项");
    expect(result).toEqual(["第一项", "第二项", "第三项"]);
  });

  it("按换行分割", () => {
    const result = splitDescription("第一行\n第二行");
    expect(result).toEqual(["第一行", "第二行"]);
  });

  it("无分隔符返回原文", () => {
    const result = splitDescription("无分隔符的描述");
    expect(result).toEqual(["无分隔符的描述"]);
  });
});

describe("getPlanFeatures", () => {
  it("single 套餐", () => {
    const features = getPlanFeatures("single_89");
    expect(features.length).toBeGreaterThan(0);
    expect(features[0].label).toBe("comparisonOriginalLink");
  });

  it("annual_799 个人版", () => {
    const features = getPlanFeatures("annual_799");
    expect(features.length).toBeGreaterThan(0);
  });

  it("enterprise_flagship", () => {
    const features = getPlanFeatures("annual_16800");
    expect(features.some(f => f.label === "comparisonUngmReg")).toBe(true);
  });

  it("enterprise_premium", () => {
    const features = getPlanFeatures("annual_26800");
    expect(features.some(f => f.label === "comparisonBidSupport")).toBe(true);
  });

  it("未知套餐回退 single", () => {
    const features = getPlanFeatures("unknown_plan");
    expect(features).toEqual(getPlanFeatures("single_89"));
  });
});

describe("PLAN_CONFIG", () => {
  it("包含主要套餐类型", () => {
    expect(PLAN_CONFIG).toHaveProperty("single");
    expect(PLAN_CONFIG).toHaveProperty("bundle");
    expect(PLAN_CONFIG).toHaveProperty("subscription");
    expect(PLAN_CONFIG).toHaveProperty("manual");
  });
});

describe("ORIGINAL_PRICES", () => {
  it("annual_799 有原价", () => {
    expect(ORIGINAL_PRICES.annual_799).toBe(1999);
  });
});

describe("formatQuota", () => {
  const mockT = ((key: string) => {
    const map: Record<string, string> = {
      membershipUnlimited: "无限",
      membershipUnlocks: "次解锁",
    };
    return map[key] ?? key;
  }) as any;

  it("配额 >= 9999 返回'无限'", () => {
    const plan = { unlock_quota: 9999 } as MembershipPlan;
    expect(formatQuota(plan, mockT)).toBe("无限");
  });

  it("配额 < 9999 返回数字+单位", () => {
    const plan = { unlock_quota: 100 } as MembershipPlan;
    expect(formatQuota(plan, mockT)).toBe("100次解锁");
  });

  it("配额为 0 返回 '0次解锁'", () => {
    const plan = { unlock_quota: 0 } as MembershipPlan;
    expect(formatQuota(plan, mockT)).toBe("0次解锁");
  });
});

describe("getPlanFeatures - 更多分支", () => {
  it("annual_8800 匹配 annual_basic", () => {
    const features = getPlanFeatures("annual_8800");
    expect(features.some((f) => f.label === "comparisonDedicatedSupport")).toBe(true);
  });

  it("annual_5600 匹配 enterprise_basic", () => {
    const features = getPlanFeatures("annual_5600");
    expect(features.some((f) => f.label === "comparisonSupplierLibrary")).toBe(true);
  });

  it("enterprise_premium 前缀匹配", () => {
    const features = getPlanFeatures("enterprise_premium_custom");
    expect(features.some((f) => f.label === "comparisonBidSupport")).toBe(true);
  });

  it("enterprise_flagship 前缀匹配", () => {
    const features = getPlanFeatures("enterprise_flagship_v2");
    expect(features.some((f) => f.label === "comparisonUngmReg")).toBe(true);
  });

  it("enterprise 前缀匹配 enterprise_basic", () => {
    const features = getPlanFeatures("enterprise_other");
    expect(features.some((f) => f.label === "comparisonSupplierLibrary")).toBe(true);
  });

  it("personal 前缀匹配", () => {
    const features = getPlanFeatures("personal_monthly");
    expect(features.some((f) => f.label === "comparisonTradeGroup")).toBe(true);
  });

  it("trial 前缀匹配 personal", () => {
    const features = getPlanFeatures("trial_7d");
    expect(features.some((f) => f.label === "comparisonTradeGroup")).toBe(true);
  });

  it("week 前缀匹配 personal", () => {
    const features = getPlanFeatures("week_basic");
    expect(features.some((f) => f.label === "comparisonTradeGroup")).toBe(true);
  });

  it("annual 前缀（非特定码）匹配 annual", () => {
    const features = getPlanFeatures("annual_custom");
    expect(features.some((f) => f.label === "comparisonContractSign")).toBe(true);
  });

  it("annual_manual_8800 匹配 annual_basic", () => {
    const features = getPlanFeatures("annual_manual_8800");
    expect(features.some((f) => f.label === "comparisonDedicatedSupport")).toBe(true);
  });

  it("annual_8 匹配 annual_basic", () => {
    const features = getPlanFeatures("annual_8");
    expect(features.some((f) => f.label === "comparisonDedicatedSupport")).toBe(true);
  });
});
