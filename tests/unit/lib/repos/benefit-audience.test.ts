import { describe, it, expect } from "vitest";
import { deriveAudience, BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";

describe("deriveAudience", () => {
  it("L1/L2 → personal", () => {
    expect(deriveAudience("L1")).toBe("personal");
    expect(deriveAudience("L2")).toBe("personal");
  });
  it("L3/L4/L5/L6 → enterprise", () => {
    for (const tier of ["L3", "L4", "L5", "L6"]) {
      expect(deriveAudience(tier)).toBe("enterprise");
    }
  });
  it("未知层级 → enterprise 兜底", () => {
    expect(deriveAudience("L9")).toBe("enterprise");
    expect(deriveAudience("")).toBe("enterprise");
  });
});

function fakePool(rows: unknown[]) {
  return { query: async () => [rows] } as unknown as import("mysql2/promise").Pool;
}

describe("BenefitSystemRepo audience 派生", () => {
  const base = {
    name_en: "X", name_zh: "x", positioning_zh: "x", price: "1", price_mode: "fixed",
    price_incl_tax: 1, currency: "CNY", billing_period_days: 365, seat_limit: 1,
    cta_i18n_key: "cta", badge: "none", sort_order: 1, is_active: 1,
  };
  it("listActivePlans 为每行补 audience", async () => {
    const repo = new BenefitSystemRepo(fakePool([
      { ...base, plan_code: "starter", commercial_tier: "L1" },
      { ...base, plan_code: "business", commercial_tier: "L3" },
    ]));
    const plans = await repo.listActivePlans();
    expect(plans.map((p) => p.audience)).toEqual(["personal", "enterprise"]);
  });
  it("getPlan 补 audience", async () => {
    const repo = new BenefitSystemRepo(fakePool([{ ...base, plan_code: "advisor", commercial_tier: "L4" }]));
    const plan = await repo.getPlan("advisor");
    expect(plan?.audience).toBe("enterprise");
  });
});
