import { describe, it, expect } from "vitest";
import {
  generateFeasibilityReport,
  getFeasibilityReportForNotice,
  type FeasibilityDeps,
  type FeasibilityReportRepoLike,
} from "@/lib/services/feasibility-report/service";
import type { FeasibilityReportRow } from "@/lib/repos/feasibility-report.repo";
import type { CapabilityRowLike, SupplierRowLike } from "@/lib/services/feasibility-report/inputs";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_VIP_ONLY } from "@/shared/constants/api";

interface FakeState {
  supplier: SupplierRowLike | null;
  notice: Record<string, unknown> | null;
  requirementRows: Array<Record<string, unknown>>;
  capabilityRows: CapabilityRowLike[];
  reports: FeasibilityReportRow[];
  savedRequirements: number;
  savedReports: number;
  extracted: number;
}

function makeRepo(state: FakeState): FeasibilityReportRepoLike {
  return {
    async findVerifiedSupplierForUser() {
      return state.supplier;
    },
    async findSupplierById() {
      return state.supplier;
    },
    async findDiagnosis() {
      return null;
    },
    async getNotice() {
      return state.notice as never;
    },
    async getOpportunityByNoticeId() {
      return null;
    },
    async listCapabilityRows() {
      return state.capabilityRows;
    },
    async listEvidenceRows() {
      return [];
    },
    async getLatestRequirements() {
      return { version: state.requirementRows.length > 0 ? 1 : 0, rows: state.requirementRows };
    },
    async saveRequirements(_noticePk, items) {
      state.savedRequirements += 1;
      state.requirementRows = items.map((item) => ({
        id: 1,
        notice_pk: 7,
        version: 1,
        seq: item.seq,
        requirement_type: item.type,
        importance: item.importance,
        title: item.title,
        value_json: item.value,
        raw_text: item.rawText,
        source_json: item.source,
        extraction_method: "llm",
        confidence: 0.8,
        prompt_version: "feas-req-v0.1",
      }));
      return 1;
    },
    async getLatestReport(_noticePk, _enterpriseId) {
      return state.reports[state.reports.length - 1] ?? null;
    },
    async findReportByHash(_noticePk, _enterpriseId, hash) {
      return state.reports.find((r) => r.input_hash === hash) ?? null;
    },
    async saveReport({ inputHash, report }) {
      state.savedReports += 1;
      state.reports.push({
        report_json: report,
        input_hash: inputHash,
        prompt_version: "feas-rules-v0.1",
        model: null,
        created_at: new Date().toISOString(),
      });
    },
  };
}

function makeDeps(repo: FeasibilityReportRepoLike, state: FakeState, overrides: Partial<FeasibilityDeps> = {}): FeasibilityDeps {
  return {
    repo,
    isEntitled: async () => true,
    getLlmCredentials: async () => ({
      baseUrl: "https://llm.example/v1",
      apiKey: "k",
      model: "demo-model",
    }),
    llmCall: async () => {
      state.extracted += 1;
      return JSON.stringify([
        {
          type: "certification",
          importance: "mandatory",
          title: "ISO 9001 认证",
          value: { code: "ISO9001" },
          source: { kind: "notice_text", quote: "ISO 9001 required" },
        },
      ]);
    },
    ...overrides,
  };
}

function baseState(): FakeState {
  return {
    supplier: { id: 1001, company: "宁波照明", certification: "ISO 9001" },
    notice: {
      notice_pk: 7,
      notice_id: "N7",
      title: "Tender",
      description: "ISO 9001 required",
      country_code: "FR",
      deadline_ts: 1790000000,
      attachments: [],
    },
    requirementRows: [],
    capabilityRows: [],
    reports: [],
    savedRequirements: 0,
    savedReports: 0,
    extracted: 0,
  };
}

describe("feasibility-report 编排服务", () => {
  it("无权益 → 403 EC_VIP_ONLY", async () => {
    const state = baseState();
    const deps = makeDeps(makeRepo(state), state, { isEntitled: async () => false });
    await expect(generateFeasibilityReport(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 403,
      code: EC_VIP_ONLY,
    });
  });

  it("未认证企业 → 403 EC_ACCESS_FORBIDDEN", async () => {
    const state = baseState();
    state.supplier = null;
    const deps = makeDeps(makeRepo(state), state);
    await expect(generateFeasibilityReport(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 403,
      code: EC_ACCESS_FORBIDDEN,
    });
  });

  it("首次生成：抽要求项 → 判定 → 落库；第二次命中缓存", async () => {
    const state = baseState();
    const repo = makeRepo(state);
    const deps = makeDeps(repo, state);

    const first = await generateFeasibilityReport(deps, { userId: 1, noticePk: 7 });
    expect(first.cached).toBe(false);
    expect(first.enterprise).toEqual({ id: 1001, name: "宁波照明" });
    expect(state.extracted).toBe(1);
    expect(state.savedRequirements).toBe(1);
    expect(state.savedReports).toBe(1);
    expect(first.report.meta.noticePk).toBe(7);
    expect(first.report.deterministic.rulesRun).toBe(1);
    // 供应商目录没有证书有效期 → 规则保守判 unknown，报告为 conditional
    expect(first.report.verdict.decision).toBe("conditional");

    const second = await generateFeasibilityReport(deps, { userId: 1, noticePk: 7 });
    expect(second.cached).toBe(true);
    expect(state.extracted).toBe(1); // 不重复抽取
    expect(state.savedReports).toBe(1); // 不重复生成
  });

  it("抽取结果为空 → 400 EC_INVALID_PARAMS（不允许空报告）", async () => {
    const state = baseState();
    const deps = makeDeps(makeRepo(state), state, { llmCall: async () => "[]" });
    await expect(generateFeasibilityReport(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 400,
      code: EC_INVALID_PARAMS,
    });
  });

  it("企业档案没有可判定能力项 → 400 并提示先完善资料", async () => {
    const state = baseState();
    state.supplier = { id: 1001, company: "空档案企业" };
    const deps = makeDeps(makeRepo(state), state);
    await expect(generateFeasibilityReport(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 400,
      code: EC_INVALID_PARAMS,
      message: expect.stringContaining("企业档案缺少可判定的能力项"),
    });
  });

  it("公告不存在 → 404", async () => {
    const state = baseState();
    state.notice = null;
    const deps = makeDeps(makeRepo(state), state);
    await expect(generateFeasibilityReport(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("GET 无报告：返回 report=null 但不报错（带上企业名）", async () => {
    const state = baseState();
    const deps = makeDeps(makeRepo(state), state);
    const data = await getFeasibilityReportForNotice(deps, { userId: 1, noticePk: 7 });
    expect(data.report).toBeNull();
    expect(data.enterprise).toEqual({ id: 1001, name: "宁波照明" });
  });

  it("GET 有报告：返回缓存的报告 JSON", async () => {
    const state = baseState();
    const deps = makeDeps(makeRepo(state), state);
    await generateFeasibilityReport(deps, { userId: 1, noticePk: 7 });
    const data = await getFeasibilityReportForNotice(deps, { userId: 1, noticePk: 7 });
    expect(data.report?.meta.noticePk).toBe(7);
    expect(data.enterprise?.id).toBe(1001);
  });

  it("GET 无权益同样 403（与 POST 同口径）", async () => {
    const state = baseState();
    const deps = makeDeps(makeRepo(state), state, { isEntitled: async () => false });
    await expect(getFeasibilityReportForNotice(deps, { userId: 1, noticePk: 7 })).rejects.toMatchObject({
      status: 403,
      code: EC_VIP_ONLY,
    });
  });
});
