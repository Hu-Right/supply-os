import { EC_FORBIDDEN } from "@/shared/constants/api";
/**
 * POST /api/supplier-diagnosis 集成测试 — 2026-11-11 一司一口径收口
 *
 * @description 用假目录仓储 + 假诊断仓储跑通路由，钉住五件事：
 *              ① 建档关闭：公司名未命中且无显式 id → 400（不再 insertEnterprise，垃圾主体入口堵死）；
 *              ② 写权闸口：有主主体非归属人 → 403 EC_FORBIDDEN；
 *              ③ 归属人放行：即使主体已认证（verify done）也可提交，201；
 *              ④ 响应键集合：claimRequired 已随口径退场（有主主体在闸口就被 403，
 *                 成功响应只能是「无主」或「归属人」提交），wire 上不得再出现；
 *              ⑤ 快照防污染（2026-11-12）：落库名取 supplier.company SSOT，
 *                 显式 id 提交时 payload 乱名（『占位』事故）不得入库。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";

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
/** V3 资质分级取数：默认空字典 + 零已持（≙ 用户没勾目标市场时不该产生缺口） */
const listActiveCertificationsWithScope = vi.fn(async (): Promise<{ code: string; name: string; category: string; scope: string; productScopes?: string[] }[]> => []);
const listCertificationCodes = vi.fn(async (): Promise<string[]> => []);
/** V3 产品范围信号：默认给「建筑工程」，让带 CE 的用例仍按通用项出分级 */
const getScopeSignals = vi.fn(async () => ({ company: "测试企业", products: "钢结构工程", industryCode: "UGT-I-0502", capabilityLabels: [] as string[] }));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    supplier: { directoryRepo: { findProfileBits, findByCompanyBest, insertEnterprise } },
    catalogRepo: { listActiveCertificationsWithScope },
  }),
}));

vi.mock("@/lib/repos/enterprise-profile.repo", () => ({
  EnterpriseProfileRepo: class {
    listCertificationCodes = listCertificationCodes;
    getScopeSignals = getScopeSignals;
  },
}));

/** 闸口事实可按用例改写；路由用 diagnosisWriteGateDecision 真实判定（importActual 保留） */
const gateFacts = { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false };
const getWriteGateFacts = vi.fn(async () => ({ ...gateFacts }));
const upsertDiagnosis = vi.fn();

vi.mock("@/lib/db/pool", () => ({
  getPool: vi.fn().mockReturnValue({}),
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

/** 用 DIAGNOSIS_FIELDS 造一份合法作答：单选取首个选项、多选空、文本占位 */
function validAnswers(): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  for (const f of DIAGNOSIS_FIELDS) {
    answers[f.key] = f.kind === "single" ? String(f.options?.[0] ?? "") : f.kind === "multi" ? [] : "略";
  }
  // V3：目标市场必答（不在 DIAGNOSIS_FIELDS 里，单独补一个合法市场码）
  answers.target_markets = ["EU"];
  return answers;
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/supplier-diagnosis", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const UPSERTED_ROW = { id: 3, user_id: 7, supplier_id: 11, score_total: 60 };

beforeEach(() => {
  findProfileBits.mockReset().mockResolvedValue({ dataQualityScore: 80, company: "库内正名科技有限公司" });
  findByCompanyBest.mockReset().mockResolvedValue(null);
  insertEnterprise.mockReset();
  Object.assign(gateFacts, { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false });
  getWriteGateFacts.mockClear();
  upsertDiagnosis.mockReset().mockResolvedValue(UPSERTED_ROW);
});

describe("POST /api/supplier-diagnosis（一司一份口径）", () => {
  it("公司名未命中 → 400 且不再建档（insertEnterprise 不得被调用）", async () => {
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "不存在的公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(40060); // EC_DIAGNOSIS_ENTITY_NOT_FOUND
    expect(insertEnterprise).not.toHaveBeenCalled();
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("有主主体非归属人（闸口拒绝）→ 403 EC_FORBIDDEN", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, verify_status: "done" });
    Object.assign(gateFacts, { selfBound: false, boundByOther: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe(EC_FORBIDDEN); // EC_FORBIDDEN
    expect(upsertDiagnosis).not.toHaveBeenCalled();
  });

  it("归属人放行：已认证主体（verify done）归属人提交 → 201，subjectUnclaimed=false", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "done" });
    Object.assign(gateFacts, { selfBound: true, claimed: true, verifyDone: true });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.supplierId).toBe(11);
    expect(body.id).toBe(3);
    expect(body.subjectUnclaimed).toBe(false);
    expect(upsertDiagnosis).toHaveBeenCalledTimes(1);
    expect(upsertDiagnosis.mock.calls[0][0].supplierId).toBe(11);
    expect(upsertDiagnosis.mock.calls[0][0].userId).toBe(7);
  });

  it("无主主体路人诊断 → 201 且 subjectUnclaimed=true（结果页认领引导的依据）", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subjectUnclaimed).toBe(true);
  });

  it("显式 supplierId 不存在 → 400（存在性校验先于闸口）", async () => {
    findProfileBits.mockResolvedValue(null);
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "任意", supplierId: 999, answers: validAnswers() }));
    expect(res.status).toBe(400);
    expect(getWriteGateFacts).not.toHaveBeenCalled();
  });

  it("成功响应键集合：无 claimRequired / 列名上网，subjectUnclaimed 在集", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "深圳某科技有限公司", supplierId: null, answers: validAnswers() }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "dimensions",
        "gradeLabel",
        "id",
        "overrideGate",
        // V3 新增三键：口径代次 + 资质分级 + 缺口明细（明细只给报告，不给表单展开）
        "schemaVersion",
        "qualGrade",
        "qualBreakdown",
        "scoreGrade",
        "scoreTotal",
        "subjectUnclaimed",
        "supplierId",
        "topGaps",
      ].sort(),
    );
    expect(Object.keys(body)).not.toContain("claimRequired");
    // V3：资质分级独立于 100 分（投标能力线），且未填目标市场时不伪造档位
    expect(body.schemaVersion).toBe(3);
    // 目标市场必答后，正常提交一定会进分级（A/B/C）；未分级只剩历史记录或字典不可用两种场景
    expect(["A", "B", "C"]).toContain(body.qualGrade);
  });

  it("V3 资质分级：填了目标市场 → 按字典与已持证书出 A/B/C，并随响应、随落库一起走", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    listActiveCertificationsWithScope.mockResolvedValueOnce([
      { code: "CE", name: "CE 认证", category: "market_access", scope: "EU", productScopes: ["all"] },
      { code: "UKCA", name: "UKCA 认证", category: "market_access", scope: "UK", productScopes: ["all"] },
    ]);
    listCertificationCodes.mockResolvedValueOnce(["CE"]);
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({
      companyName: "深圳某科技有限公司",
      supplierId: null,
      answers: { ...validAnswers(), target_markets: ["EU", "UK"] },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    // 缺 UKCA 一项 → B（A=0 项、B=1~2 项、C>=3 项）
    expect(body.qualGrade).toBe("B");
    expect(body.qualBreakdown.missingCodes).toEqual(["UKCA"]);
    expect(body.qualBreakdown.markets.map((m: { market: string }) => m.market)).toEqual(["EU", "UK"]);
    // 落库参数里带同一份快照（接口与报告读同一处，不各自算一遍）
    expect(upsertDiagnosis.mock.calls.at(-1)?.[0].qualification).toMatchObject({ grade: "B" });
  });

  it("V3 资质分级：字典读失败不影响提交（降级为未分级，并标明原因）", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    listActiveCertificationsWithScope.mockRejectedValueOnce(new Error("db down"));
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({
      companyName: "深圳某科技有限公司",
      supplierId: null,
      answers: { ...validAnswers(), target_markets: ["EU"] },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.qualGrade).toBeNull();
    expect(body.qualBreakdown.unscoredReason).toBe("dict_unavailable");
  });

  it("快照防污染：显式 supplierId + payload 乱名（『占位』事故回归）→ 落库名取 supplier.company SSOT", async () => {
    findProfileBits.mockResolvedValue({
      dataQualityScore: 80,
      company: "杭州中建工程技术有限公司",
    });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "占位", supplierId: 11, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect(upsertDiagnosis).toHaveBeenCalledTimes(1);
    expect(upsertDiagnosis.mock.calls[0][0].supplierId).toBe(11);
    // payload 里的『占位』不得入库：company_name 快照必须是库内正名
    expect(upsertDiagnosis.mock.calls[0][0].companyName).toBe("杭州中建工程技术有限公司");
  });

  it("快照防污染：按名命中路径同样落库正名（DB 值为准，typed 简写不入库）", async () => {
    findByCompanyBest.mockResolvedValue({ id: 11, company: "库内正名科技有限公司", verify_status: "pending" });
    const { POST } = await import("@/app/api/supplier-diagnosis/route");
    const res = await POST(postReq({ companyName: "库内正名", supplierId: null, answers: validAnswers() }));
    expect(res.status).toBe(201);
    expect(upsertDiagnosis.mock.calls[0][0].companyName).toBe("库内正名科技有限公司");
  });
});
