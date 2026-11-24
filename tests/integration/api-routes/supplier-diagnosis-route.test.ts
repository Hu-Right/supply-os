import { EC_FORBIDDEN } from "@/shared/constants/api";
/**
 * POST /api/supplier-diagnosis 集成测试 — 2026-11-24 计算职责收口
 *
 * @description 评分与资质分级已迁到后台（intelligence-daily），门户只保留：
 *              登录鉴权、主体确认、写权闸口、提交埋点，以及把后台结果原样返回。
 *              本测试钉住：
 *              ① 未收录主体 → 400，后台不得被调用；
 *              ② 有主主体非归属人 → 403，后台不得被调用；
 *              ③ 归属人/无主主体 → 201，后台收到正名与完整作答；
 *              ④ 后台失败 → 500，不在本地偷偷补算；
 *              ⑤ 响应键集合与后台结果同形，subjectUnclaimed 仍由门户判定。
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

const { submitDiagnosisToBackend } = vi.hoisted(() => ({
  submitDiagnosisToBackend: vi.fn(),
}));
vi.mock("@/lib/services/supplier-diagnosis/backend-client", () => ({ submitDiagnosisToBackend }));

const findProfileBits = vi.fn();
const findByCompanyBest = vi.fn();
const insertEnterprise = vi.fn();

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    supplier: { directoryRepo: { findProfileBits, findByCompanyBest, insertEnterprise } },
  }),
}));

const { getWriteGateFacts } = vi.hoisted(() => ({ getWriteGateFacts: vi.fn() }));
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

/** 后台返回的同形结果（门户不再自己算） */
const BACKEND_RESULT = {
  id: 3,
  schemaVersion: 3,
  scoreTotal: 60,
  scoreGrade: "C",
  gradeLabel: "C — 基础辅导",
  dimensions: [],
  topGaps: [],
  overrideGate: { triggered: false, reason: "" },
  qualGrade: "B",
  qualBreakdown: {
    targetMarkets: ["EU"],
    markets: [],
    requiredCodes: ["CE"],
    heldCodes: ["CE"],
    missingCodes: ["UKCA"],
    missingCount: 1,
    noRequirementMarkets: [],
    unscoredReason: null,
  },
};

beforeEach(() => {
  findProfileBits.mockReset().mockResolvedValue({ dataQualityScore: 80, company: "库内正名科技有限公司" });
  findByCompanyBest.mockReset().mockResolvedValue(null);
  insertEnterprise.mockReset();
  Object.assign(gateFacts, { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false });
  getWriteGateFacts.mockReset().mockImplementation(async () => ({ ...gateFacts }));
  submitDiagnosisToBackend.mockReset().mockResolvedValue({ ...BACKEND_RESULT });
});

describe("POST /api/supplier-diagnosis（后台计算，门户只转发）", () => {
  it("公司名未命中 → 400 且不再建档、不调后台", async () => {
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "不存在的公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(40060);
    expect(insertEnterprise).not.toHaveBeenCalled();
    expect(submitDiagnosisToBackend).not.toHaveBeenCalled();
  });

  it("有主主体非归属人（闸口拒绝）→ 403，不调后台", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, verify_status: "done" });
    Object.assign(gateFacts, { selfBound: false, boundByOther: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(EC_FORBIDDEN);
    expect(submitDiagnosisToBackend).not.toHaveBeenCalled();
  });

  it("归属人放行：后台收到正名、userId、supplierId 与完整作答，201", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "done" });
    Object.assign(gateFacts, { selfBound: true, claimed: true, verifyDone: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.supplierId).toBe(11);
    expect(body.subjectUnclaimed).toBe(false);
    expect(body.id).toBe(3);
    expect(submitDiagnosisToBackend).toHaveBeenCalledTimes(1);
    const sent = submitDiagnosisToBackend.mock.calls[0][0];
    expect(sent).toMatchObject({
      userId: 7,
      supplierId: 11,
      companyName: "库内正名科技有限公司",
      ip: "127.0.0.1",
    });
    expect(sent.answers.target_markets).toEqual(["EU"]);
  });

  it("无主主体路人诊断 → 201 且 subjectUnclaimed=true", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect((await res.json()).subjectUnclaimed).toBe(true);
  });

  it("显式 supplierId 不存在 → 400（存在性校验先于闸口与后台）", async () => {
    findProfileBits.mockResolvedValue(null);
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "任意", supplierId: 999, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect(getWriteGateFacts).not.toHaveBeenCalled();
    expect(submitDiagnosisToBackend).not.toHaveBeenCalled();
  });

  it("后台不可用 → 500，门户不做本地兜底评分", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    submitDiagnosisToBackend.mockRejectedValueOnce(new Error("DIAGNOSIS_BACKEND_503"));
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("诊断计算服务暂不可用");
  });

  it("成功响应键集合：后台结果 + 门户归属判定，无本地评分痕迹", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "id", "schemaVersion", "scoreTotal", "scoreGrade", "gradeLabel",
        "dimensions", "topGaps", "overrideGate", "qualGrade", "qualBreakdown",
        "supplierId", "subjectUnclaimed",
      ].sort(),
    );
    expect(body.qualGrade).toBe("B");
    expect(body.qualBreakdown.missingCodes).toEqual(["UKCA"]);
  });

  it("快照防污染：显式 supplierId + payload 乱名 → 后台收到库内正名", async () => {
    findProfileBits.mockResolvedValue({ dataQualityScore: 80, company: "杭州中建工程技术有限公司" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "占位", supplierId: 11, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect(submitDiagnosisToBackend.mock.calls[0][0].companyName).toBe("杭州中建工程技术有限公司");
  });
});
