import { describe, it, expect } from "vitest";
import { groupPlansByAudience } from "@/features/membership/utils";
import type { PlanView } from "@/types";

const plan = (code: string, audience: "personal" | "enterprise"): PlanView =>
  ({ planCode: code, audience }) as PlanView;

describe("groupPlansByAudience", () => {
  it("按 audience 二分", () => {
    const { personal, enterprise } = groupPlansByAudience([
      plan("starter", "personal"),
      plan("business", "enterprise"),
      plan("pro", "personal"),
    ]);
    expect(personal.map((p) => p.planCode)).toEqual(["starter", "pro"]);
    expect(enterprise.map((p) => p.planCode)).toEqual(["business"]);
  });
  it("缺失 audience 归 enterprise（与派生兜底一致）", () => {
    const { personal, enterprise } = groupPlansByAudience([{ planCode: "x" } as PlanView]);
    expect(personal).toHaveLength(0);
    expect(enterprise.map((p) => p.planCode)).toEqual(["x"]);
  });
});
