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
    expect(recoVariant(1)).toBe("control");
    expect(recoVariant(999)).toBe("control");
    expect(recoVariant(0)).toBe("control");
  });

  it("同一 userId 结果恒定（幂等）", () => {
    const r1 = recoVariant(42);
    const r2 = recoVariant(42);
    expect(r1).toBe(r2);
  });

  it("返回值仅为 control 或 treatment", () => {
    const valid = new Set(["control", "treatment"]);
    expect(valid.has(recoVariant(123))).toBe(true);
  });
});
