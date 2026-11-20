import { describe, it, expect } from "vitest";
import { recommendProcurementMethod } from "@/shared/utils/procurement-method";
import { PROCUREMENT_METHOD, type ProcurementMethod } from "@/shared/constants/procurement";

describe("recommendProcurementMethod 三问决策表", () => {
  const R = recommendProcurementMethod;

  it("兜底：标准化货物 + 合格最低价 + 一次性 → RFQ", () => {
    expect(R(["goods"], "lowest", "once")).toBe(PROCUREMENT_METHOD.RFQ);
    expect(R([], "lowest", "once")).toBe(PROCUREMENT_METHOD.RFQ);
  });

  it("Q2 先征集意向 → EOI（事前阶段，优先于其余维度）", () => {
    expect(R(["goods"], "intent", "once")).toBe("eoi");
    expect(R(["engineering"], "intent", "recurring")).toBe("eoi");
  });

  it("Q3 长期重复供货 → LTA（优先于标的形态）", () => {
    expect(R(["goods"], "lowest", "recurring")).toBe("lta");
    expect(R(["service"], "scored", "recurring")).toBe("lta");
  });

  it("工程类标的 → ITB（优先于评分口径）", () => {
    expect(R(["engineering"], "scored", "once")).toBe("itb");
    expect(R(["goods", "engineering"], "lowest", "once")).toBe("itb");
  });

  it("方案型标的，或服务类按综合评分 → RFP", () => {
    expect(R(["solution"], "lowest", "once")).toBe("rfp");
    expect(R(["service"], "scored", "once")).toBe("rfp");
    // 服务 + 合格最低价仍走询价
    expect(R(["service"], "lowest", "once")).toBe("rfq");
  });

  it("对未知输入防御：非法 objectTypes/口径取默认路径", () => {
    expect(R(["unknown_type"] as unknown as string[], "weird" as never, "odd" as never)).toBe(
      PROCUREMENT_METHOD.RFQ,
    );
    expect(R(null as unknown as string[])).toBe(PROCUREMENT_METHOD.RFQ);
  });

  it("恒返回合法方式码（幂等出口）", () => {
    const all = Object.values(PROCUREMENT_METHOD) as ProcurementMethod[];
    for (const evalMode of ["lowest", "scored", "intent"] as const) {
      for (const cycle of ["once", "recurring"] as const) {
        expect(all).toContain(R(["goods", "engineering", "service", "solution"], evalMode, cycle));
      }
    }
  });
});
