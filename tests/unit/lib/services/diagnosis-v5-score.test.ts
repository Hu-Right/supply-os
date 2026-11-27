/**
 * 门户 V5 评分引擎 — 与后台同口径（满分 100、等级线、红线封顶）。
 */
import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_V5_FIELD_MAP,
  DIAGNOSIS_V5_FORM_FIELDS,
} from "@/shared/constants/diagnosis-v5";
import { scoreDiagnosisV5, type DiagnosisAnswersV5 } from "@/lib/services/scoring/diagnosis-v5-score";

/** 全选最高分：单选取最后一个选项，多选取全部选项 */
function bestAnswers(): DiagnosisAnswersV5 {
  const answers: DiagnosisAnswersV5 = {};
  for (const field of DIAGNOSIS_V5_FORM_FIELDS) {
    if (field.kind === "multi") answers[field.key] = [...(field.options ?? [])];
    else answers[field.key] = field.options?.[field.options.length - 1] ?? "";
  }
  return answers;
}

const bestDerived = {
  certCoveragePercent: 100,
  legalMissingCount: 0,
};

describe("scoreDiagnosisV5", () => {
  it("全项满分 + 档案齐备 → 100 分 A，无封顶", () => {
    const r = scoreDiagnosisV5({
      answers: bestAnswers(),
      supplier: { dataQualityScore: 90, heldCertCount: 10 },
      derived: bestDerived,
    });
    expect(r.totalScore).toBe(100);
    expect(r.gradeBeforeCaps).toBe("A");
    expect(r.grade).toBe("A");
    expect(r.caps).toHaveLength(0);
    expect(r.partScores.map((p) => p.score)).toEqual([30, 50, 20]);
  });

  it("无出口主体资质 → 封顶 D", () => {
    const answers = bestAnswers();
    answers.export_entity = DIAGNOSIS_V5_FIELD_MAP["export_entity"].options![0];
    const r = scoreDiagnosisV5({
      answers,
      supplier: { dataQualityScore: 90, heldCertCount: 10 },
      derived: bestDerived,
    });
    expect(r.gradeBeforeCaps).toBe("A");
    expect(r.grade).toBe("D");
    expect(r.overrideGateTriggered).toBe(true);
    expect(r.caps.some((c) => c.cap === "D")).toBe(true);
  });

  it("目标市场缺 2 项法定准入 → 封顶 C", () => {
    const r = scoreDiagnosisV5({
      answers: bestAnswers(),
      supplier: { dataQualityScore: 90, heldCertCount: 10 },
      derived: { certCoveragePercent: 60, legalMissingCount: 2 },
    });
    expect(r.grade).toBe("C");
    expect(r.caps.some((c) => c.cap === "C")).toBe(true);
  });

  it("低分作答 → 等级按 55/70/85 分档", () => {
    const answers = bestAnswers();
    for (const field of DIAGNOSIS_V5_FORM_FIELDS) {
      if (field.kind === "multi") answers[field.key] = [];
      else answers[field.key] = field.options?.[0] ?? "";
    }
    const r = scoreDiagnosisV5({
      answers,
      supplier: { dataQualityScore: 0, heldCertCount: 0 },
      derived: { certCoveragePercent: 0, legalMissingCount: 0 },
    });
    expect(r.totalScore).toBe(0);
    expect(r.grade).toBe("D");
  });
});
