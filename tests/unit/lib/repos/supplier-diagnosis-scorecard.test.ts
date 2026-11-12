/**
 * 诊断公开成绩单测试：取数形状 + 视图脱敏
 * @module tests/unit/lib/repos/supplier-diagnosis-scorecard.test.ts
 * @description 钉住两件事：
 *              ① findClaimantScorecard 的 SQL——JOIN users 限定「提交账号仍绑定在本主体上」
 *                （路人写的无主报告不上详情页），且只取成绩单四列；
 *              ② supplierScorecardViewOf 的公开面收敛——只出 名称+加权得分，
 *                原始分/证据来源/评分依据/作答不出视图；语言化维度名与等级文案；
 *                breakdown 缺失或形状不合返回 null（宁缺毋假）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";
import { supplierScorecardViewOf } from "@/lib/services/supplier-diagnosis/scorecard-view";

describe("SupplierDiagnosisRepo.findClaimantScorecard（取数形状）", () => {
  const mockExecute = vi.fn();
  const repo = new SupplierDiagnosisRepo({ execute: mockExecute } as any);

  beforeEach(() => mockExecute.mockReset());

  it("SQL JOIN users 限定归属人提交，只取四列", async () => {
    mockExecute.mockResolvedValue([[{ score_total: 87, score_grade: "B", score_breakdown: "{}", submitted_at: new Date() }]]);
    await repo.findClaimantScorecard(11);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("FROM supplier_diagnosis d");
    expect(sql).toContain("JOIN users u ON u.id = d.user_id AND u.supplier_id = d.supplier_id");
    expect(sql).toContain("u.supplier_link_status = 'verified'");
    expect(sql).toContain("LIMIT 1");
    // 只取成绩单面四列，不得带出答案列
    expect(sql).not.toContain("SELECT *");
    expect(sql).not.toContain("english_evidence_level");
    expect(params).toEqual([11]);
  });

  it("无归属人报告 → null", async () => {
    mockExecute.mockResolvedValue([[]]);
    expect(await repo.findClaimantScorecard(11)).toBeNull();
  });
});

describe("supplierScorecardViewOf（公开面收敛）", () => {
  const row = (breakdown: unknown, overrides: Partial<{ score_total: number | null; score_grade: string | null }> = {}) => ({
    score_total: 87,
    score_grade: "B",
    score_breakdown: breakdown,
    submitted_at: new Date("2026-11-12T08:00:00Z"),
    ...overrides,
  });
  const breakdown = {
    dimensions: [
      { no: 1, name: "资质完备度", nameEn: "Qualification readiness", weight: 20, rawScore: 80, weightedScore: 16, evidenceSource: "x", scoringBasis: "y", needsManualReview: false },
      { no: 2, name: "语言能力", nameEn: "Language capability", weight: 10, rawScore: 40, weightedScore: 4, evidenceSource: "x", scoringBasis: "y", needsManualReview: false },
    ],
    overrideGateTriggered: false,
    overrideGateReason: null,
  };

  it("中文环境：中文维度名 + 中文等级文案，只出 name+score", () => {
    const v = supplierScorecardViewOf(row(breakdown), "zh");
    expect(v).not.toBeNull();
    expect(v!.totalScore).toBe(87);
    expect(v!.grade).toBe("B");
    expect(v!.gradeLabel).toContain("B");
    expect(v!.dimensions).toEqual([
      { name: "资质完备度", score: 16 },
      { name: "语言能力", score: 4 },
    ]);
    const json = JSON.stringify(v);
    // 脱敏断言：原始分/证据/依据/触发闸口不出公开面
    expect(json).not.toContain("rawScore");
    expect(json).not.toContain("evidenceSource");
    expect(json).not.toContain("scoringBasis");
    expect(json).not.toContain("overrideGate");
    expect(json).not.toContain("needsManualReview");
  });

  it("非 zh 环境：英文维度名 + 英文等级文案", () => {
    const v = supplierScorecardViewOf(row(breakdown), "en");
    expect(v!.dimensions[0].name).toBe("Qualification readiness");
    expect(v!.gradeLabel).not.toContain("首批");
  });

  it("grade 列缺失时按引擎阈值推导（87→A / 59→C）；持久化 grade 优先于推导", () => {
    // 持久化 grade 优先（反映引擎含覆盖闸口的最终结论，夹具 87+B 即此语义）
    expect(supplierScorecardViewOf(row(breakdown), "zh")!.grade).toBe("B");
    // 缺失则按引擎阈值推导：totalScore >= 80 → A，>= 60 → B，否则 C
    expect(supplierScorecardViewOf(row(breakdown, { score_grade: null }), "zh")!.grade).toBe("A");
    expect(supplierScorecardViewOf(row(breakdown, { score_total: 59, score_grade: null }), "zh")!.grade).toBe("C");
  });

  it("breakdown 缺失/空维度/总分非数 → null（宁缺毋假）", () => {
    expect(supplierScorecardViewOf(row(null), "zh")).toBeNull();
    expect(supplierScorecardViewOf(row({ dimensions: [] }), "zh")).toBeNull();
    expect(supplierScorecardViewOf(row({ dimensions: [{ name: "x", nameEn: "y", weightedScore: "NaN?" }] }), "zh")).toBeNull();
    expect(supplierScorecardViewOf(row(breakdown, { score_total: null }), "zh")).toBeNull();
  });
});
