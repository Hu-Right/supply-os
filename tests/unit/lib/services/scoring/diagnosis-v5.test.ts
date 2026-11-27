import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_V5_DIMENSIONS,
  DIAGNOSIS_V5_FIELD_MAP,
  DIAGNOSIS_V5_FORM_FIELDS,
  assertDiagnosisV5Intact,
} from "@/shared/constants/diagnosis-v5";
import { scoreDiagnosisV5, type DiagnosisAnswersV5 } from "@/lib/services/scoring/diagnosis-v5";

function allMaxAnswers(): DiagnosisAnswersV5 {
  const answers: DiagnosisAnswersV5 = {};
  for (const f of DIAGNOSIS_V5_FORM_FIELDS) {
    if (f.key === "target_markets") {
      answers[f.key] = ["EU"];
    } else if (f.kind === "multi") {
      answers[f.key] = [...(f.options ?? [])];
    } else {
      answers[f.key] = String(f.options?.[f.options.length - 1] ?? "");
    }
  }
  return answers;
}

const MAX_SUPPLIER = { dataQualityScore: 100, heldCertCount: 12 };
const MAX_DERIVED = { certCoveragePercent: 100, legalMissingCount: 0 };

describe("diagnosis V5 unified scoring（门户本地）", () => {
  it("all max → 100 / A, three parts sum to 100", () => {
    assertDiagnosisV5Intact();
    const r = scoreDiagnosisV5({ answers: allMaxAnswers(), supplier: MAX_SUPPLIER, derived: MAX_DERIVED });
    expect(r.totalScore).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.dimensions).toHaveLength(12);
    expect(r.partScores.map((p) => p.max)).toEqual([30, 50, 20]);
    expect(r.partScores.reduce((s, p) => s + p.score, 0)).toBe(100);
    expect(r.caps).toHaveLength(0);
  });

  it("no export entity → grade capped at D even with high score", () => {
    const answers = allMaxAnswers();
    answers.export_entity = DIAGNOSIS_V5_FIELD_MAP["export_entity"].options![0];
    const r = scoreDiagnosisV5({ answers, supplier: MAX_SUPPLIER, derived: MAX_DERIVED });
    expect(r.gradeBeforeCaps).not.toBe("D");
    expect(r.grade).toBe("D");
    expect(r.caps.some((c) => c.reason.includes("出口主体"))).toBe(true);
  });

  it("one legal gap → capped at C; three gaps → capped at D", () => {
    const one = scoreDiagnosisV5({
      answers: allMaxAnswers(),
      supplier: MAX_SUPPLIER,
      derived: { ...MAX_DERIVED, legalMissingCount: 1 },
    });
    expect(one.grade).toBe("C");

    const three = scoreDiagnosisV5({
      answers: allMaxAnswers(),
      supplier: MAX_SUPPLIER,
      derived: { ...MAX_DERIVED, legalMissingCount: 3 },
    });
    expect(three.grade).toBe("D");
  });

  it("certificate coverage 0 zeroes A1.1 and the 12-point A1 dimension", () => {
    const r = scoreDiagnosisV5({
      answers: allMaxAnswers(),
      supplier: MAX_SUPPLIER,
      derived: { certCoveragePercent: 0, legalMissingCount: 0 },
    });
    const a1 = r.dimensions.find((d) => d.no === 1)!;
    expect(a1.rawScore).toBe(0);
    expect(a1.weightedScore).toBe(0);
    expect(r.totalScore).toBe(88);
  });

  it("compliance governance zero → capped at C", () => {
    const answers = allMaxAnswers();
    answers.compliance_governance = DIAGNOSIS_V5_FIELD_MAP["compliance_governance"].options![0];
    const r = scoreDiagnosisV5({ answers, supplier: MAX_SUPPLIER, derived: MAX_DERIVED });
    expect(r.grade).toBe("C");
    expect(r.caps.some((c) => c.reason.includes("合规治理"))).toBe(true);
  });

  it("unanswered capability question scores 0, not full marks", () => {
    const answers = allMaxAnswers();
    answers.quality_system = "";
    const r = scoreDiagnosisV5({ answers, supplier: MAX_SUPPLIER, derived: MAX_DERIVED });
    const b3 = r.dimensions.find((d) => d.no === 6)!;
    expect(b3.rawScore).toBeLessThan(5);
    expect(r.totalScore).toBeLessThan(100);
  });

  it("dimension weights sum to 100 and every dimension has indicators", () => {
    expect(DIAGNOSIS_V5_DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBe(100);
    for (const d of DIAGNOSIS_V5_DIMENSIONS) expect(d.indicators.length).toBeGreaterThan(0);
  });
});
