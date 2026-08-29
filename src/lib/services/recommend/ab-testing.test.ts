import { describe, it, expect } from "vitest";
import { recoVariant, AB_TREATMENT_PCT } from "./ab-testing";

describe("AB_TREATMENT_PCT", () => {
  it("默认值 0（实验关闭）", () => {
    // 测试环境未设 RECO_AB_TREATMENT_PCT → 默认 0
    expect(AB_TREATMENT_PCT).toBe(0);
  });
});

describe("recoVariant", () => {
  it("AB_TREATMENT_PCT=0 → 全部 control", () => {
    // 默认环境：所有用户进 control
    expect(recoVariant("user@test.com")).toBe("control");
    expect(recoVariant("another-user")).toBe("control");
    expect(recoVariant("")).toBe("control");
  });

  it("同一 userKey 结果恒定（幂等）", () => {
    const r1 = recoVariant("stable-user");
    const r2 = recoVariant("stable-user");
    expect(r1).toBe(r2);
  });

  it("返回值仅为 control 或 treatment", () => {
    const valid = new Set(["control", "treatment"]);
    expect(valid.has(recoVariant("any-user"))).toBe(true);
  });
});
