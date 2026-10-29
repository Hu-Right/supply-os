import { describe, it, expect } from "vitest";
import { buildFeasibilityReportDocx } from "@/lib/services/feasibility-report/docx";
import type { FeasibilityReport } from "@/lib/services/feasibility-report/types";

function fixtureReport(): FeasibilityReport {
  return {
    meta: {
      noticePk: 1786812089,
      enterpriseId: 39479,
      promptVersion: "feas-rules-v0.1",
      model: null,
      generatedAt: "2026-10-29T00:00:00.000Z",
      dataCompleteness: { requirementItems: 3, capabilities: 2, unknowns: 1 },
      review: { status: "ai_draft" },
    },
    verdict: {
      decision: "conditional",
      score: 0.62,
      reasons: [
        { text: "存在 1 项缺口或评分偏低（0.62 < 0.55）", refs: ["req-1"], confidence: "high", kind: "rule" },
      ],
    },
    gaps: [
      { requirementId: "req-1", status: "partial", title: "ISO 14001 认证", suggest: "需人工确认等效性", refs: ["req-1"], ruleId: "CERT-03" },
    ],
    matrix: [
      { requirementId: "req-1", title: "ISO 14001 认证", requirement: "ISO14001", capability: "—", status: "partial", refs: ["req-1"], judgedBy: "rule" },
    ],
    unknowns: [{ requirementId: "req-2", title: "本地代理", reason: "企业档案缺本地化信息", need: "补充证据", ruleId: "LOC-00" }],
    deterministic: { rulesRun: 3, rulesPassed: 1, rulesFailed: 1, rulesUnknown: 1, rulesNotApplicable: 0 },
    aiAdvice: [],
    disclaimer: "本报告由规则引擎与 AI 辅助生成，属投标决策参考；重大投标决策请人工复核。",
  };
}

describe("feasibility-report Word 导出", () => {
  it("生成合法 docx（zip 魔数 PK + 非空字节）", async () => {
    const buffer = await buildFeasibilityReportDocx(fixtureReport(), {
      noticeTitle: "MAROC - FOURNITURES & INSTALLATIONS",
      exportedAt: "2026-10-29T00:00:00.000Z",
    });
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("空缺口/空待确认时也能导出（不抛错）", async () => {
    const report = fixtureReport();
    report.gaps = [];
    report.unknowns = [];
    report.aiAdvice = [];
    const buffer = await buildFeasibilityReportDocx(report);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
