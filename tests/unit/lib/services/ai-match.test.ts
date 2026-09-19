/**
 * AI 智能匹配服务测试
 * @module tests/unit/lib/services/ai-match.test.ts
 * @description 验证匹配缓存走 match_results 独立列，不再读写评分 score_* / score_reasons。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMatch, upsertMatch, findScore, upsertScore, findActiveByUser, fetchSupplierProfiles, countDiagnosisPending, callLlmForScore } = vi.hoisted(() => ({
  findMatch: vi.fn(),
  upsertMatch: vi.fn(),
  findScore: vi.fn(),
  upsertScore: vi.fn(),
  findActiveByUser: vi.fn(),
  fetchSupplierProfiles: vi.fn(),
  countDiagnosisPending: vi.fn(),
  callLlmForScore: vi.fn(),
}));

vi.mock("@/lib/repos/ai-summary.repo", () => ({
  AiSummaryRepo: function (this: any) {
    Object.assign(this, { findMatch, upsertMatch, findScore, upsertScore });
  },
}));

vi.mock("@/lib/repos/llm-config.repo", () => ({
  LlmConfigRepo: function (this: any) {
    Object.assign(this, { findActiveByUser });
  },
}));

vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: any) {
    Object.assign(this, { fetchSupplierProfiles, countDiagnosisPending });
  },
}));

vi.mock("@/lib/services/ai-summary/crypto", () => ({ decryptApiKey: vi.fn(() => "plain-key") }));

vi.mock("@/lib/services/ai-score/llm-client", () => ({ callLlmForScore }));

import { getOrGenerateAiMatch } from "@/lib/services/ai-match";
import { decryptApiKey } from "@/lib/services/ai-summary/crypto";

const decryptMock = vi.mocked(decryptApiKey);

const noticePool = () => ({
  query: vi.fn()
    .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
    .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]]),
} as any);

const supplierRow = { pool_id: 5, supplier_id: 10, company: "工厂A", industry: "电子", products: "P" };
const llmData = {
  qualification: 60, experience: 60, certification: 60, region: 60,
  scale: 60, delivery: 60, price: 60, overall: 88, details: {}, reasoning: "r",
};

beforeEach(() => {
  vi.clearAllMocks();
  findActiveByUser.mockResolvedValue({ id: 1, base_url: "https://x", api_key: "enc", model: "m" });
  callLlmForScore.mockResolvedValue({ data: llmData, model: "m" });
  upsertMatch.mockResolvedValue(undefined);
  countDiagnosisPending.mockResolvedValue(2);
});

describe("getOrGenerateAiMatch 缓存分键", () => {
  it("match_results 命中 → 直接返回，不调用评分缓存/LLM", async () => {
    findMatch.mockResolvedValue({ match_results: JSON.stringify([{ pool_id: 5, supplier_id: 10, company: "工厂A", overall: 88, details: {} }]) });
    const res = await getOrGenerateAiMatch({} as any, 1, 2, false);
    expect(res.cached).toBe(true);
    expect(res.top[0].overall).toBe(88);
    expect(res.diagPending).toBe(2);
    expect(findScore).not.toHaveBeenCalled();
    expect(callLlmForScore).not.toHaveBeenCalled();
  });

  it("生成后写 match_results（含整体 reasoning），不触碰评分列", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.top).toHaveLength(1);
    expect(res.diagPending).toBe(2);
    expect(upsertMatch).toHaveBeenCalledTimes(1);
    const cached = JSON.parse(upsertMatch.mock.calls[0][0].matchResults);
    expect(cached[0].reasoning).toBe("r");
    expect(upsertScore).not.toHaveBeenCalled();
    expect(findScore).not.toHaveBeenCalled();
  });
});

describe("getOrGenerateAiMatch 并发评估与失败处理", () => {
  it("单家失败不阻塞其余，failed/evaluated 计数正确", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([
      { pool_id: 1, supplier_id: 11, company: "工厂A", industry: "电子" },
      { pool_id: 2, supplier_id: 12, company: "工厂B", industry: "纺织" },
    ]);
    callLlmForScore.mockImplementation(async (_creds: unknown, _sys: unknown, userPrompt: string) => {
      if (userPrompt.includes("工厂A")) throw new Error("LLM_HTTP_500");
      return { data: { ...llmData, overall: 70 }, model: "m" };
    });
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.top).toHaveLength(1);
    expect(res.top[0].company).toBe("工厂B");
    expect(res.failed).toBe(1);
    expect(res.evaluated).toBe(2);
    expect(res.poolSize).toBe(2);
    expect(res.cached).toBe(false);
  });

  it("全部失败 → top 为空、不写缓存、failed 等于候选数", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([
      { pool_id: 1, supplier_id: 11, company: "工厂A", industry: "电子" },
      { pool_id: 2, supplier_id: 12, company: "工厂B", industry: "纺织" },
    ]);
    callLlmForScore.mockRejectedValue(new Error("LLM_HTTP_500"));
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.top).toHaveLength(0);
    expect(res.failed).toBe(2);
    expect(res.evaluated).toBe(2);
    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it("资源库超过 5 家时按行业相关性粗筛，匹配度最高者精评后排名第一", async () => {
    findMatch.mockResolvedValue(null);
    const industries = ["纺织", "家具", "LED", "五金", "玩具", "食品", "化工"];
    fetchSupplierProfiles.mockResolvedValue(
      industries.map((industry, i) => ({ pool_id: i + 1, supplier_id: 100 + i, company: industry, industry })),
    );
    // 公告标题含 LED：只有 LED 工厂粗筛得分 > 0；按公司名行区分 LLM 返回分数以验证排序
    const ledPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "LED 显示屏采购项目", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
        .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]]),
    } as any;
    callLlmForScore.mockImplementation(async (_creds: unknown, _sys: unknown, userPrompt: string) => ({
      data: { ...llmData, overall: userPrompt.includes("公司名称：LED") ? 90 : 40 },
      model: "m",
    }));
    const res = await getOrGenerateAiMatch(ledPool, 1, 2, false);
    expect(res.poolSize).toBe(7);
    expect(res.evaluated).toBe(5); // 粗筛后仅 5 家进入 LLM
    expect(res.failed).toBe(0);
    expect(res.top[0].company).toBe("LED");
  });

  it("资源库为空 → 空结果且元数据全零", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([]);
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.top).toHaveLength(0);
    expect(res.poolSize).toBe(0);
    expect(res.evaluated).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.diagPending).toBe(0);
    expect(callLlmForScore).not.toHaveBeenCalled();
  });
});

describe("getOrGenerateAiMatch 错误与缓存损坏分支", () => {
  it("缓存 JSON 损坏 → 视为无缓存重新生成", async () => {
    findMatch.mockResolvedValue({ match_results: "{broken json" });
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.cached).toBe(false);
    expect(callLlmForScore).toHaveBeenCalledTimes(1);
  });

  it("缓存内容非数组 → 视为无缓存重新生成", async () => {
    findMatch.mockResolvedValue({ match_results: JSON.stringify({ legacy: true }) });
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.cached).toBe(false);
  });

  it("LLM 配置缺失 → 40001 errLlmNotConfigured", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    findActiveByUser.mockResolvedValue(null);
    await expect(getOrGenerateAiMatch(noticePool(), 1, 2, false)).rejects.toMatchObject({ status: 400, code: 40001 });
  });

  it("API Key 解密失败 → 40001 errLlmNotConfigured", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    decryptMock.mockImplementationOnce(() => { throw new Error("bad key"); });
    await expect(getOrGenerateAiMatch(noticePool(), 1, 2, false)).rejects.toMatchObject({ status: 400, code: 40001 });
  });

  it("公告不存在 → 404 errNoticeNotFound", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    const emptyPool = { query: vi.fn().mockResolvedValue([[]]) } as any;
    await expect(getOrGenerateAiMatch(emptyPool, 1, 2, false)).rejects.toMatchObject({ status: 404, code: 40006 });
  });
});
