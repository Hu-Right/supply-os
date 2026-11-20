import { describe, it, expect } from "vitest";
import {
  recommendProcurementMethod,
  recommendMethodV2,
} from "@/shared/utils/procurement-method";
import { PROCUREMENT_METHOD, type ProcurementMethod } from "@/shared/constants/procurement";

/**
 * 判定引擎决策表（设计稿 §1.3，《全案》F08 决策树顺序）：
 * 强制程序 → LTA（长期重复）→ EOI（不明确/先征集）→ ITB（工程）→ RFP（比方案）→ RFQ 兜底。
 * v1 三问签名保留为适配层（P0 向导轻量路径）。
 */
describe("recommendProcurementMethod 三问适配层决策表", () => {
  const R = recommendProcurementMethod;

  it("兜底：标准化货物 + 合格最低价 + 一次性 → RFQ", () => {
    expect(R(["goods"], "lowest", "once")).toBe(PROCUREMENT_METHOD.RFQ);
    // 空输入 → 规格不明 → EOI（全案决策树：需求尚不清楚先征集）
    expect(R([], "lowest", "once")).toBe("eoi");
  });

  it("Q2 先征集意向 → EOI；与长期重复并存时按全案顺序 LTA 优先", () => {
    expect(R(["goods"], "intent", "once")).toBe("eoi");
    expect(R(["engineering"], "intent", "recurring")).toBe("lta");
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

  it("对未知输入防御：未知 objectTypes 视为规格不明 → EOI，恒合法", () => {
    expect(R(["unknown_type"] as unknown as string[], "weird" as never, "odd" as never)).toBe("eoi");
    expect(R(null as unknown as string[])).toBe("eoi");
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

describe("recommendMethodV2 七维判定", () => {
  it("维7 强制程序：命中即采纳指定方式（平台不覆盖）", () => {
    expect(recommendMethodV2({ mandatoryRuleMethod: "rfp" }).method).toBe("rfp");
    expect(recommendMethodV2({ mandatoryRuleMethod: "itb", objectTypes: ["goods"] }).method).toBe("itb");
    // 非法值忽略
    expect(recommendMethodV2({ mandatoryRuleMethod: "bogus", objectTypes: ["goods"] }).method).toBe("rfq");
  });

  it("LTA 在 EOI 之前（全案决策树第 3/4 步顺序）", () => {
    expect(recommendMethodV2({ recurring: true, preSourcing: true }).method).toBe("lta");
  });

  it("规格明确性驱动 EOI/RFQ 分流", () => {
    expect(recommendMethodV2({ specClarity: "unclear", objectTypes: ["goods"] }).method).toBe("eoi");
    expect(recommendMethodV2({ specClarity: "clear", objectTypes: ["goods"] }).method).toBe("rfq");
  });

  it("输出命中路径与待补信息键（i18n 键，UI 渲染）", () => {
    const r = recommendMethodV2({ objectTypes: [], budgetKnown: false });
    expect(r.reasonKeys).toContain("method_reason_presourcing");
    expect(r.missingKeys).toEqual(expect.arrayContaining(["method_missing_budget", "method_missing_spec"]));
  });

  it("开放方式闸外的方式仍可被推荐（引擎与开放集解耦；开放集只在服务端收敛写入）", () => {
    // 规格明确 + 工程 → ITB（P1a 未开放，向导按 PROCUREMENT_METHOD_AVAILABLE 禁用按钮）
    expect(recommendMethodV2({ objectTypes: ["engineering"] }).method).toBe("itb");
  });
});
