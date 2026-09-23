/**
 * 采购摘要免费档脱敏 · 语义固化测试
 * benefit-matrix (mask helpers) — pin tests
 *
 * @description 钉住免费档摘要脱敏的维度可见性（coreDeliverables 完整、
 *              keyQualifications 截断试读、其余四个高价值维度整段置空）与
 *              ai_summary 权益码/完整层级常量。
 *              门控判定本身由矩阵逐格决定，其契约在 repos/benefit-system.repo.test.ts
 *              覆盖；本模块不再携带"档位数字（benefit_rank）"，故不再有档位边界用例。
 */
import { describe, it, expect } from "vitest";
import {
  maskSummaryForFree,
  SUMMARY_DIMENSIONS,
  AI_SUMMARY_BENEFIT,
  AI_SUMMARY_FULL_LEVEL,
  type MaskableSummary,
} from "@/lib/services/benefit-matrix";

function makeSummary(overrides: Partial<MaskableSummary> = {}): MaskableSummary {
  return {
    coreDeliverables: "采购内容",
    keyQualifications: "资格条件",
    paymentCycle: "付款周期",
    competitiveLandscape: "竞争格局",
    bidStrategy: "投标策略",
    riskAlerts: "风险提示",
    ...overrides,
  };
}

describe("ai_summary 权益码常量", () => {
  it("权益码与「完整」层级固定（与库内 level_dict 口径同源，文案不两处存放）", () => {
    expect(AI_SUMMARY_BENEFIT).toBe("ai_summary");
    expect(AI_SUMMARY_FULL_LEVEL).toBe(2);
  });
});

describe("maskSummaryForFree 免费档脱敏", () => {
  it("coreDeliverables 完整保留（唯一免费可见维度）", () => {
    const s = makeSummary({ coreDeliverables: "完整采购内容".repeat(100) });
    expect(maskSummaryForFree(s).coreDeliverables).toBe(s.coreDeliverables);
  });

  it("keyQualifications 截断到 200 字试读", () => {
    const long = "资格".repeat(500); // 1000 字
    const masked = maskSummaryForFree(makeSummary({ keyQualifications: long }));
    expect(masked.keyQualifications).toHaveLength(200);
    expect(long.startsWith(masked.keyQualifications)).toBe(true);
  });

  it("keyQualifications 不足 200 字 → 原样保留不截断", () => {
    const short = "短资格条件";
    expect(maskSummaryForFree(makeSummary({ keyQualifications: short })).keyQualifications).toBe(short);
  });

  it("付款周期/竞争格局/投标策略/风险提示 → 整段置空", () => {
    const masked = maskSummaryForFree(makeSummary());
    expect(masked.paymentCycle).toBe("");
    expect(masked.competitiveLandscape).toBe("");
    expect(masked.bidStrategy).toBe("");
    expect(masked.riskAlerts).toBe("");
  });

  it("不修改入参（纯函数，返回新对象）", () => {
    const input = makeSummary();
    const snapshot = { ...input };
    maskSummaryForFree(input);
    expect(input).toEqual(snapshot);
  });

  it("六个维度 key 与 SUMMARY_DIMENSIONS 严格对齐（防字段漂移）", () => {
    const s = makeSummary();
    for (const dim of SUMMARY_DIMENSIONS) {
      expect(s).toHaveProperty(dim);
    }
  });
});
