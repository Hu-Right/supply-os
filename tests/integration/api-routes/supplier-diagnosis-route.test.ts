/**
 * POST /api/supplier-diagnosis 集成测试 — 2026-11-29 门户本地落库（去掉后台同步依赖）
 *
 * @description 评分与资质分级在门户执行（V5），保存也由门户写 `supplier_diagnosis`；
 *              后台只按需读表出报告。本测试钉住：
 *              ① 未收录主体 → 400，评分与写库都不得被调用；
 *              ② 有主主体非归属人 → 403，评分与写库都不得被调用；
 *              ③ 归属人 → 201，写库参数带门户算好的 score 快照 / 资质快照 / 正名；
 *              ④ 门户评分失败 → 503，不写库；
 *              ⑤ 写库失败 → 500，不返回半截结果；
 *              ⑥ 响应键集合含评分/资质/闸门，且不再依赖后台。
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

const { scoreDiagnosisSubmission } = vi.hoisted(() => ({ scoreDiagnosisSubmission: vi.fn() }));
vi.mock("@/lib/services/supplier-diagnosis/score-submission", () => ({ scoreDiagnosisSubmission }));

const findProfileBits = vi.fn();
const findByCompanyBest = vi.fn();
const insertEnterprise = vi.fn();

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    supplier: { directoryRepo: { findProfileBits, findByCompanyBest, insertEnterprise } },
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

const STORED_ROW = { id: 3, score_total: 88, schema_version: 5, qual_grade: "B" };

beforeEach(() => {
  findProfileBits.mockReset().mockResolvedValue({ dataQualityScore: 80, company: "库内正名科技有限公司" });
  findByCompanyBest.mockReset().mockResolvedValue(null);
  insertEnterprise.mockReset();
  Object.assign(gateFacts, { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false });
  getWriteGateFacts.mockReset().mockImplementation(async () => ({ ...gateFacts }));
  upsertDiagnosis.mockReset().mockResolvedValue({ ...STORED_ROW });
  scoreDiagnosisSubmission.mockReset().mockResolvedValue({
    companyName: "库内正名科技有限公司",
    score: {
      totalScore: 88,
      grade: "A",
      gradeBeforeCaps: "A",
      gradeLabel: "A — 优先应标",
      dimensions: [],
      partScores: [],
      fieldScores: [],
      caps: [],
      topGaps: [],
      overrideGateTriggered: false,
      overrideGateReason: "",
      qualGrade: "B",
      qualBreakdown: { targetMarkets: ["EU"], missingCodes: ["UKCA"] },
    },
    bidGate: { triggered: false, reason: "" },
  });
});

describe("POST /api/supplier-diagnosis（门户本地落库）", () => {
  it("公司名未命中 → 400 且不建档、不评分、不写库", async () => {
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "不存在的公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(40060);
    expect(insertEnterprise).not.toHaveBeenCalled();
    expect(scoreDiagnosisSubmission).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("有主主体非归属人（闸口拒绝）→ 403，不评分、不写库", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, verify_status: "done" });
    Object.assign(gateFacts, { selfBound: false, boundByOther: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(403);
    expect(scoreDiagnosisSubmission).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("归属人放行：本地写库带正名/评分快照/资质快照，201", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "done" });
    Object.assign(gateFacts, { selfBound: true, claimed: true, verifyDone: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(3);
    expect(body.supplierId).toBe(11);
    expect(body.subjectUnclaimed).toBe(false);

    expect(upsertDiagnosis).toHaveBeenCalledTimes(1);
    const sent = upsertDiagnosis.mock.calls[0][0];
    expect(sent).toMatchObject({
      userId: 7,
      supplierId: 11,
      companyName: "库内正名科技有限公司",
      ip: "127.0.0.1",
      qualification: { grade: "B" },
    });
    expect(sent.answers.target_markets).toEqual(["EU"]);
    expect(sent.score).toMatchObject({ totalScore: 88, grade: "A" });
    expect(sent.score.breakdown).toMatchObject({ ruleVersion: 5 });
  });

  it("门户评分失败 → 503，不写库", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    scoreDiagnosisSubmission.mockRejectedValueOnce(new Error("DIAGNOSIS_QUALIFICATION_UNAVAILABLE"));
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(503);
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("无主主体路人诊断 → 201 且 subjectUnclaimed=true", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect((await res.json()).subjectUnclaimed).toBe(true);
  });

  it("显式 supplierId 不存在 → 400（存在性校验先于闸口/评分/写库）", async () => {
    findProfileBits.mockResolvedValue(null);
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "任意", supplierId: 999, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect(getWriteGateFacts).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("写库失败 → 500，提示保存失败", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    upsertDiagnosis.mockRejectedValueOnce(new Error("db down"));
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("诊断保存失败");
  });

  it("成功响应键集合：评分/资质/闸门齐全，含 bidGate", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "id", "schemaVersion", "scoreTotal", "scoreGrade", "gradeLabel", "gradeBeforeCaps",
        "dimensions", "partScores", "caps", "topGaps", "overrideGate",
        "qualGrade", "qualBreakdown", "supplierId", "subjectUnclaimed", "bidGate",
      ].sort(),
    );
    expect(body.qualGrade).toBe("B");
  });

  it("快照防污染：显式 supplierId + payload 乱名 → 写库用库内正名", async () => {
    findProfileBits.mockResolvedValue({ dataQualityScore: 80, company: "杭州中建工程技术有限公司" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "占位", supplierId: 11, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect(upsertDiagnosis.mock.calls[0][0].companyName).toBe("杭州中建工程技术有限公司");
  });
});
