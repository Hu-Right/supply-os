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
  DIAGNOSIS_FORM_FIELDS,
  DIAGNOSIS_QUAL_FIELDS,
  assertDiagnosisDimensionsIntact,
  scoreDiagnosisField,
  DIAGNOSIS_FIELD_MAP,
  diagnosisProgress,
} from "@/shared/constants/diagnosis-dimensions";
import { scoreDiagnosis, type DiagnosisAnswers, type SupplierProfileBits } from "@/lib/services/scoring/diagnosis-v2";

const FULL_PROFILE: SupplierProfileBits = { dataQualityScore: 100 };

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
    // 22 = V2 的 19（含 2 个已下线但保留列的题）+ 出口主体资质 + D4 两题
    expect(DIAGNOSIS_FIELDS.length).toBe(22);
    expect(DIAGNOSIS_DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });

  it("completion progress only counts required single-choice answers", () => {
    // V3：表单不再问 bid_willingness，故必答单选从 15 降到 14（目标市场是多选、不属于必答）
    const requiredFields = DIAGNOSIS_FORM_FIELDS.filter((f) => f.kind === "single");
    expect(requiredFields.length).toBe(17);
    expect(diagnosisProgress({})).toEqual({ answeredRequired: 0, totalRequired: 17, percent: 0 });

    const one = { [requiredFields[0].key]: requiredFields[0].options![0] };
    expect(diagnosisProgress(one)).toEqual({ answeredRequired: 1, totalRequired: 17, percent: 6 });

    // 多选/文本是选填：填了也不进入分子
    const optional = {
      procurement_frameworks: [DIAGNOSIS_FIELDS.find((f) => f.key === "procurement_frameworks")!.options![0]],
      service_countries: "中国, 德国",
      target_markets: ["EU", "US"],
    };
    expect(diagnosisProgress(optional).answeredRequired).toBe(0);

    const all = Object.fromEntries(
      requiredFields.map((f) => [f.key, f.options![f.options!.length - 1]]),
    );
    expect(diagnosisProgress(all)).toEqual({ answeredRequired: 17, totalRequired: 17, percent: 100 });
  });

  it("V3: target_markets 只出现在表单字段里，不参与 V2 评分", () => {
    expect(DIAGNOSIS_FORM_FIELDS.map((f) => f.key)).toContain("target_markets");
    expect(DIAGNOSIS_FORM_FIELDS.map((f) => f.key)).not.toContain("bid_willingness");
    // V2 评分字段清单不变（AI 画像契约 diagnosisColumnSelect 依赖它）
    expect(DIAGNOSIS_FIELDS.map((f) => f.key)).toContain("bid_willingness");
    expect(DIAGNOSIS_FIELDS.map((f) => f.key)).not.toContain("target_markets");
    expect(DIAGNOSIS_QUAL_FIELDS).toHaveLength(1);
    expect(DIAGNOSIS_FIELD_MAP["target_markets"].dimensionNo).toBe(0);
  });

  it("rejects a field claimed by two dimensions (N3)", () => {    const dup = DIAGNOSIS_DIMENSIONS.map((d) => ({ no: d.no, fields: [...d.fields] }));
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
    const r = scoreDiagnosis({ answers: answersWith(low), supplier: { dataQualityScore: 0 } });
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

  it("D4 两题（台账 / 取证时效）按 scoreMap 计分，并有「零分」档兜底", () => {
    const ledger = DIAGNOSIS_FIELD_MAP["cert_ledger"];
    const delivery = DIAGNOSIS_FIELD_MAP["cert_delivery"];
    expect(ledger.options).toHaveLength(4);
    expect(delivery.options).toHaveLength(4);
    // 选项序即分数序：0/2/4/5，空值落最低档
    expect(ledger.scoreMap).toEqual([0, 2, 4, 5]);
    expect(delivery.scoreMap).toEqual([0, 2, 4, 5]);
    expect(scoreDiagnosisField(ledger, "")).toBe(0);
    expect(scoreDiagnosisField(delivery, delivery.options![3])).toBe(5);
  });

  it("D1 = 档案完整度与出口主体资质各半；没有经营权时档案再全也拿不到 5", () => {
    // 档案 100（5/5）+ 出口资质满档（5/5）→ 5
    expect(
      scoreDiagnosis({ answers: answersWith(), supplier: { dataQualityScore: 100 } }).dimensions[0].rawScore,
    ).toBe(5);
    // 档案 100（5/5）+ 无经营权（0/5）→ 四舍五入 3：门口过不去，D1 不允许满分
    const noEntity = answersWith({ export_entity: MIN_SINGLE("export_entity") });
    const d1 = scoreDiagnosis({ answers: noEntity, supplier: { dataQualityScore: 100 } }).dimensions[0];
    expect(d1.rawScore).toBe(3);
    expect(d1.evidenceSource).toBe("主数据 + 表单");
    expect(d1.scoringBasis).toContain("100/100");
    expect(d1.scoringBasis).toContain("出口主体资质");
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
