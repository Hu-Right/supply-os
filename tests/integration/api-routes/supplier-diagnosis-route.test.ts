import { EC_FORBIDDEN } from "@/shared/constants/api";
/**
 * POST /api/supplier-diagnosis 集成测试 — 2026-11-27 架构回退
 *
 * @description 评分与资质分级重新在门户本地完成；后台 intelligence-daily 只消费落库快照
 *              生成 AI 详细 PDF，提交链路不再同步调后台。本测试钉住：
 *              ① 未收录主体 → 400，不评分、不落库；
 *              ② 有主主体非归属人 → 403，不评分、不落库；
 *              ③ 归属人/无主主体 → 201，本地评分 + 资质分级 + 快照落库；
 *              ④ 本地评分/落库失败 → 500，不再出现「诊断计算服务暂不可用」；
 *              ⑤ 响应只返回分数/等级等前端展示字段，附完整快照供后台 PDF 消费。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DIAGNOSIS_V5_FORM_FIELDS } from "@/shared/constants/diagnosis-v5";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

vi.mock("@/lib/middleware/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/utils/ip", () => ({
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const findProfileBits = vi.fn();
const findByCompanyBest = vi.fn();
const insertEnterprise = vi.fn();

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    supplier: { directoryRepo: { findProfileBits, findByCompanyBest, insertEnterprise } },
    catalogRepo: {},
    marketRequirementRepo: {},
  }),
}));

const { getWriteGateFacts, upsertDiagnosis } = vi.hoisted(() => ({
  getWriteGateFacts: vi.fn(),
  upsertDiagnosis: vi.fn(),
}));
const gateFacts = { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false };

vi.mock("@/lib/db/pool", () => ({
  getPool: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/repos/supplier-diagnosis-submit-log.repo", () => ({
  SupplierDiagnosisSubmitLogRepo: class {
    record = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@/lib/repos/supplier-diagnosis.repo", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/repos/supplier-diagnosis.repo")>();
  return {
    ...actual,
    SupplierDiagnosisRepo: class {
      getWriteGateFacts = getWriteGateFacts;
      upsertDiagnosis = upsertDiagnosis;
    },
  };
});

vi.mock("@/lib/repos/enterprise-profile.repo", () => ({
  EnterpriseProfileRepo: class {},
}));

const { scoreDiagnosisV5 } = vi.hoisted(() => ({ scoreDiagnosisV5: vi.fn() }));
vi.mock("@/lib/services/scoring/diagnosis-v5", () => ({ scoreDiagnosisV5 }));

const { evaluateQualificationFor } = vi.hoisted(() => ({ evaluateQualificationFor: vi.fn() }));
vi.mock("@/lib/services/supplier-diagnosis/qualification", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/services/supplier-diagnosis/qualification")>();
  return { ...actual, evaluateQualificationFor };
});

/** 用 V5 表单字段造一份合法作答：单选取首项、多选取前两项、目标市场必选 */
function validAnswers(): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  for (const f of DIAGNOSIS_V5_FORM_FIELDS) {
    answers[f.key] = f.kind === "single"
      ? String(f.options?.[0] ?? "")
      : [...(f.options ?? [])].slice(0, 2);
  }
  answers.target_markets = ["EU"];
  return answers;
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/supplier-diagnosis", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const SCORING = {
  totalScore: 60,
  grade: "C",
  gradeBeforeCaps: "B",
  gradeLabel: "C — 有条件应标",
  gradeLabelEn: "C — Conditional bidding",
  gradePath: "path",
  gradePathEn: "path",
  dimensions: [{ no: 1, part: "A", name: "市场准入资质", nameEn: "Market access", weight: 12, rawScore: 3, weightedScore: 7.2, evidenceSource: "表单", scoringBasis: "", needsManualReview: false }],
  partScores: [{ code: "A", name: "资质与合规", score: 20, max: 30 }],
  caps: [{ reason: "目标市场法定准入缺口 1 项", cap: "C" }],
  topGaps: [{ dimension: "市场准入资质", dimensionEn: "Market access", priority: "High" }],
  overrideGateTriggered: true,
  overrideGateReason: "目标市场法定准入缺口 1 项",
};

const QUALIFICATION = {
  grade: "B",
  breakdown: {
    targetMarkets: ["EU"],
    markets: [],
    requiredCodes: ["CE"],
    heldCodes: ["CE"],
    missingCodes: ["UKCA"],
    missingCount: 1,
    noRequirementMarkets: [],
    unscoredReason: null,
    requirements: {
      legal: [{ held: true }, { held: false }],
      green: [],
      legalMissingCount: 1,
    },
  },
};

beforeEach(() => {
  findProfileBits.mockReset().mockResolvedValue({ dataQualityScore: 80, company: "库内正名科技有限公司" });
  findByCompanyBest.mockReset().mockResolvedValue(null);
  insertEnterprise.mockReset();
  Object.assign(gateFacts, { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false });
  getWriteGateFacts.mockReset().mockImplementation(async () => ({ ...gateFacts }));
  upsertDiagnosis.mockReset().mockResolvedValue({ id: 3 });
  scoreDiagnosisV5.mockReset().mockReturnValue({ ...SCORING });
  evaluateQualificationFor.mockReset().mockResolvedValue(QUALIFICATION);
});

describe("POST /api/supplier-diagnosis（门户本地评分，不再依赖后台）", () => {
  it("公司名未命中 → 400 且不评分、不落库", async () => {
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "不存在的公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(40060);
    expect(insertEnterprise).not.toHaveBeenCalled();
    expect(scoreDiagnosisV5).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("有主主体非归属人（闸口拒绝）→ 403，不评分、不落库", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, verify_status: "done" });
    Object.assign(gateFacts, { selfBound: false, boundByOther: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(EC_FORBIDDEN);
    expect(scoreDiagnosisV5).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("归属人放行：本地 V5 评分 + 资质分级 + 快照落库，201", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "done" });
    Object.assign(gateFacts, { selfBound: true, claimed: true, verifyDone: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.supplierId).toBe(11);
    expect(body.subjectUnclaimed).toBe(false);
    expect(body.id).toBe(3);
    expect(body.scoreTotal).toBe(60);
    expect(body.scoreGrade).toBe("C");
    expect(body.gradeLabel).toBe("C — 有条件应标");
    expect(scoreDiagnosisV5).toHaveBeenCalledTimes(1);
    expect(upsertDiagnosis).toHaveBeenCalledTimes(1);

    const scored = scoreDiagnosisV5.mock.calls[0][0];
    expect(scored.answers.target_markets).toEqual(["EU"]);
    expect(scored.supplier.dataQualityScore).toBe(80);
    expect(scored.supplier.heldCertCount).toBe(1);
    expect(scored.derived.certCoveragePercent).toBe(50);

    const saved = upsertDiagnosis.mock.calls[0][0];
    expect(saved).toMatchObject({
      userId: 7,
      supplierId: 11,
      companyName: "库内正名科技有限公司",
      ip: "127.0.0.1",
    });
    expect(saved.score.breakdown).toMatchObject({ ruleVersion: 5, gradeBeforeCaps: "B" });
    expect(saved.qualification.grade).toBe("B");
  });

  it("无主主体路人诊断 → 201 且 subjectUnclaimed=true", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect((await res.json()).subjectUnclaimed).toBe(true);
  });

  it("显式 supplierId 不存在 → 400（存在性校验先于闸口与评分）", async () => {
    findProfileBits.mockResolvedValue(null);
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "任意", supplierId: 999, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect(getWriteGateFacts).not.toHaveBeenCalled();
    expect(scoreDiagnosisV5).not.toHaveBeenCalled();
  });

  it("本地评分/落库异常 → 500，不出现「诊断计算服务暂不可用」", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    scoreDiagnosisV5.mockImplementation(() => { throw new Error("score failed"); });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(500);
    const body = await res.json();
    // withRoute 对 500 统一脱敏，不向客户端透出内部错误文本
    expect(body.message).not.toContain("诊断计算服务");
  });

  it("成功响应键集合：分数/等级 + 完整快照，供后台 PDF 消费", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "id", "schemaVersion", "scoreTotal", "scoreGrade", "gradeLabel", "gradeBeforeCaps",
        "dimensions", "partScores", "caps", "topGaps", "overrideGate", "qualGrade", "qualBreakdown",
        "supplierId", "subjectUnclaimed",
      ].sort(),
    );
    expect(body.qualGrade).toBe("B");
    expect(body.qualBreakdown.missingCodes).toEqual(["UKCA"]);
  });

  it("快照防污染：显式 supplierId + payload 乱名 → 落库与评分都用库内正名", async () => {
    findProfileBits.mockResolvedValue({ dataQualityScore: 80, company: "杭州中建工程技术有限公司" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "占位", supplierId: 11, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect(upsertDiagnosis.mock.calls[0][0].companyName).toBe("杭州中建工程技术有限公司");
  });
});
