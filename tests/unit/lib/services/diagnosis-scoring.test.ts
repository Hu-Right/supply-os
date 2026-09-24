/**
 * 诊断 v2 评分与常量结构闭合测试
 *
 * @module tests/unit/lib/services/diagnosis-scoring
 * @description 既钉绝对值（权重 100、19 题、满分 100、最低分档），也钉结构闭合
 *              （字段不跨维度复用、选项与分档一一对应），避免"只做自比基线"的假门禁。
 */
import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_FIELDS,
  DIAGNOSIS_DIMENSIONS,
  assertDiagnosisDimensionsIntact,
  scoreDiagnosisField,
  DIAGNOSIS_FIELD_MAP,
} from "@/shared/constants/diagnosis-dimensions";
import { scoreDiagnosis, type DiagnosisAnswers, type SupplierProfileBits } from "@/lib/services/scoring/diagnosis-v2";

const FULL_PROFILE: SupplierProfileBits = { dataQualityScore: 100, infoChecked: true };

function answersWith(overrides: Record<string, string | string[]> = {}): DiagnosisAnswers {
  const base: DiagnosisAnswers = {};
  for (const f of DIAGNOSIS_FIELDS) {
    if (f.kind === "multi") base[f.key] = [...(f.options ?? [])];
    else if (f.kind === "text") base[f.key] = "中国, 德国, 美国, 法国, 日本";
    else base[f.key] = f.options![f.options!.length - 1] ?? "";
  }
  return { ...base, ...overrides };
}

const MIN_SINGLE = (key: string) => DIAGNOSIS_FIELD_MAP[key].options![0] ?? "";

describe("diagnosis constants structural integrity", () => {
  it("passes the structural self-check and pins absolute totals", () => {
    expect(() => assertDiagnosisDimensionsIntact()).not.toThrow();
    expect(DIAGNOSIS_FIELDS.length).toBe(19);
    expect(DIAGNOSIS_DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });

  it("rejects a field claimed by two dimensions (N3)", () => {
    const dup = DIAGNOSIS_DIMENSIONS.map((d) => ({ no: d.no, fields: [...d.fields] }));
    dup[1]!.fields.push("technical_response");
    const claimed = new Set<string>();
    let violation = false;
    for (const dim of dup) for (const key of dim.fields) {
      if (claimed.has(key)) violation = true;
      claimed.add(key);
    }
    expect(violation).toBe(true);
  });
});

describe("scoreDiagnosis", () => {
  it("full marks on every dimension yields 100 / grade A", () => {
    const r = scoreDiagnosis({ answers: answersWith(), supplier: FULL_PROFILE });
    expect(r.totalScore).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.dimensions.every((d) => d.rawScore === 5)).toBe(true);
    expect(r.overrideGateTriggered).toBe(false);
  });

  it("lowest band on every question yields a low score and grade C", () => {
    const low: Record<string, string | string[]> = {};
    for (const f of DIAGNOSIS_FIELDS) {
      if (f.kind === "multi") low[f.key] = [];
      else if (f.kind === "text") low[f.key] = "";
      else low[f.key] = f.options![0] ?? "";
    }
    const r = scoreDiagnosis({ answers: answersWith(low), supplier: { dataQualityScore: 0, infoChecked: false } });
    expect(r.totalScore).toBeLessThan(15);
    expect(r.grade).toBe("C");
  });

  it("never-bid record caps D3 to <=1 even with other D3 answers maxed", () => {
    const r = scoreDiagnosis({
      answers: answersWith({ tender_experience: MIN_SINGLE("tender_experience"), tender_amount_band: MIN_SINGLE("tender_amount_band") }),
      supplier: FULL_PROFILE,
    });
    const d3 = r.dimensions.find((d) => d.no === 3)!;
    expect(d3.rawScore).toBeLessThanOrEqual(1);
    // 其余维度满分 → 总分仍在 A 档，覆盖闸口必须拦住 A
    expect(r.totalScore).toBeGreaterThanOrEqual(80);
    expect(r.overrideGateTriggered).toBe(true);
  });

  it("mandatory_docs bands score 0/2/3/4/5 by item count", () => {
    const field = DIAGNOSIS_FIELD_MAP["mandatory_docs"];
    const opts = field.options!;
    const expectBand = [
      [0, 0], [1, 2], [2, 2], [3, 3], [4, 3], [5, 4], [6, 4], [7, 5], [8, 5],
    ] as const;
    for (const [count, score] of expectBand) {
      expect(scoreDiagnosisField(field, opts.slice(0, count) as unknown as string[])).toBe(score);
    }
  });

  it("D1 derives from supplier data_quality_score, not from what the user typed", () => {
    const answered = answersWith();
    // 生成列分档：85+ → 5；65-84 → 4
    expect(scoreDiagnosis({ answers: answered, supplier: { dataQualityScore: 92, infoChecked: true } }).dimensions[0].rawScore).toBe(5);
    expect(scoreDiagnosis({ answers: answered, supplier: { dataQualityScore: 70, infoChecked: true } }).dimensions[0].rawScore).toBe(4);
    // 未经人工核对不得满分
    const r = scoreDiagnosis({ answers: answered, supplier: { dataQualityScore: 100, infoChecked: false } });
    const d1 = r.dimensions.find((d) => d.no === 1)!;
    expect(d1.rawScore).toBe(4);
    expect(d1.evidenceSource).toBe("主数据派生");
    expect(d1.scoringBasis).toContain("未经人工核对");
  });

  it("is deterministic for identical input (snapshot-safe)", () => {
    const a = scoreDiagnosis({ answers: answersWith(), supplier: FULL_PROFILE });
    const b = scoreDiagnosis({ answers: answersWith(), supplier: FULL_PROFILE });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("rejects out-of-range option values instead of silently scoring them", () => {
    expect(() => scoreDiagnosis({ answers: answersWith({ ungm_status: "已注册十级" }), supplier: FULL_PROFILE })).toThrow(
      /out of range/,
    );
  });
});
