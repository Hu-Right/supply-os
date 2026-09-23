import { describe, it, expect } from "vitest";
import { groupPlansByAudience } from "@/features/membership/utils";
import type { PlanCatalogRow } from "@/types";

const plan = (code: string, audience: "personal" | "enterprise"): PlanCatalogRow =>
  ({ plan_code: code, audience }) as PlanCatalogRow;

describe("groupPlansByAudience", () => {
  it("按 audience 二分", () => {
    const { personal, enterprise } = groupPlansByAudience([
      plan("starter", "personal"),
      plan("business", "enterprise"),
      plan("pro", "personal"),
    ]);
    expect(personal.map((p) => p.plan_code)).toEqual(["starter", "pro"]);
    expect(enterprise.map((p) => p.plan_code)).toEqual(["business"]);
  });
  it("缺失 audience 归 enterprise（与派生兜底一致）", () => {
    const { personal, enterprise } = groupPlansByAudience([{ plan_code: "x" } as PlanCatalogRow]);
    expect(personal).toHaveLength(0);
    expect(enterprise.map((p) => p.plan_code)).toEqual(["x"]);
  });
});
