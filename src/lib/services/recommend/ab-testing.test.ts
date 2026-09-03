import { describe, it, expect, vi, afterEach } from "vitest";
import { recoVariant, AB_TREATMENT_PCT } from "./ab-testing";

afterEach(() => {
  // 动态重载模块后恢复环境变量与模块注册表，避免污染其他用例
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("AB_TREATMENT_PCT 常量", () => {
  it("默认环境（未设置）→ 0（全 control）", () => {
    expect(AB_TREATMENT_PCT).toBe(0);
  });
});

describe("recoVariant（默认全 control）", () => {
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

// ── 放量分支 ──────────────────────────────────────────────────────────────────
// AB_TREATMENT_PCT 为模块加载时求值的常量，测放量逻辑需
// resetModules + stubEnv + 动态 import 重新求值。

describe("RECO_AB_TREATMENT_PCT 放量（模块加载时求值）", () => {
  async function loadWithPct(value: string): Promise<typeof import("./ab-testing")> {
    vi.resetModules();
    vi.stubEnv("RECO_AB_TREATMENT_PCT", value);
    return import("./ab-testing");
  }

  it("放量解析：夹取到 [0,100]，非法值回落 0", async () => {
    expect((await loadWithPct("100")).AB_TREATMENT_PCT).toBe(100);
    expect((await loadWithPct("150")).AB_TREATMENT_PCT).toBe(100); // 上限夹取
    expect((await loadWithPct("-5")).AB_TREATMENT_PCT).toBe(0); // 下限夹取
    expect((await loadWithPct("abc")).AB_TREATMENT_PCT).toBe(0); // NaN → ||0
    expect((await loadWithPct("12")).AB_TREATMENT_PCT).toBe(12); // 正常取值
  });

  it("PCT=100 → 全部 treatment（含 userId=0 边界）", async () => {
    const { recoVariant: variant } = await loadWithPct("100");
    expect(variant(1001)).toBe("treatment");
    expect(variant(0)).toBe("treatment");
    expect(variant(999999)).toBe("treatment");
  });

  it("PCT=0（显式）→ 全部 control（一键回退路径）", async () => {
    const { recoVariant: variant } = await loadWithPct("0");
    expect(variant(1001)).toBe("control");
  });

  it("PCT=50 → 双桶均出现且同 userId 恒定（FNV 哈希分流）", async () => {
    const { recoVariant: variant } = await loadWithPct("50");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(variant(i));
    }
    expect(seen.has("treatment")).toBe(true);
    expect(seen.has("control")).toBe(true);
    // 分桶对同一 userId 恒定（跨请求一致性）
    expect(variant(7)).toBe(variant(7));
  });
});
