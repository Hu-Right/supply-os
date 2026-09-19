/**
 * AI 适配评分服务测试
 * @module tests/unit/lib/services/ai-score.test.ts
 * @description 验证缓存命中守卫：仅有摘要/匹配的空评分行不得被误判为已评分（返回全 0）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findScore, removeScore, upsertScore, findActiveByUser, callLlmForScore } = vi.hoisted(() => ({
  findScore: vi.fn(),
  removeScore: vi.fn(),
  upsertScore: vi.fn(),
  findActiveByUser: vi.fn(),
  callLlmForScore: vi.fn(),
}));

vi.mock("@/lib/repos/ai-summary.repo", () => ({
  AiSummaryRepo: function (this: any) {
    Object.assign(this, { findScore, removeScore, upsertScore });
  },
}));

vi.mock("@/lib/repos/llm-config.repo", () => ({
  LlmConfigRepo: function (this: any) {
    Object.assign(this, { findActiveByUser });
  },
}));

vi.mock("@/lib/services/ai-summary/crypto", () => ({ decryptApiKey: vi.fn(() => "plain-key") }));

vi.mock("@/lib/services/ai-score/llm-client", () => ({ callLlmForScore }));

import { getOrGenerateAiScore } from "@/lib/services/ai-score";
import { decryptApiKey } from "@/lib/services/ai-summary/crypto";

const decryptMock = vi.mocked(decryptApiKey);

const llmData = {
  qualification: 70, experience: 70, certification: 70, region: 70,
  scale: 70, delivery: 70, price: 70, overall: 75,
  details: {}, reasoning: "r",
};

function mockPoolForGeneration() {
  return {
    query: vi.fn()
      .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]]) // notice base
      .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]]) // opp
      .mockResolvedValueOnce([[{ supplier_id: 10 }]]) // crm_users
      .mockResolvedValueOnce([[{ company: "C", industry: "I", products: "P", certification: "", country: "CN", city: "", type: "", registered_capital: "", established_at: "", intro: "", employee_count: "", export_scale: "", service_countries: "", overseas_companies: "", ungm_status: "", english_team: "", payment_terms: "", bid_willingness: "" }]]), // supplier
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  findActiveByUser.mockResolvedValue({ id: 1, base_url: "https://x", api_key: "enc", model: "m" });
  callLlmForScore.mockResolvedValue({ data: llmData, model: "m" });
  upsertScore.mockResolvedValue(undefined);
});

describe("getOrGenerateAiScore 缓存命中守卫", () => {
  it("已写入评分的行 → 命中缓存，不调用 LLM", async () => {
    findScore.mockResolvedValue({
      score_overall: 80, score_qualification: 80, score_experience: 80, score_certification: 80,
      score_region: 80, score_scale: 80, score_delivery: 80, score_price: 80,
      score_reasons: '{"qualification":{"reason":"x","matched":[],"gaps":[]}}', score_reasoning: "old",
    });
    const res = await getOrGenerateAiScore({} as any, 1, 2, false);
    expect(res.cached).toBe(true);
    expect(res.overall).toBe(80);
    expect(callLlmForScore).not.toHaveBeenCalled();
  });

  it("仅有摘要的空评分行（score_overall=NULL）→ 不得返回全 0，应重新生成", async () => {
    findScore.mockResolvedValue({
      score_overall: null, score_qualification: null, score_reasons: null, score_reasoning: null,
    });
    const res = await getOrGenerateAiScore(mockPoolForGeneration(), 1, 2, false);
    expect(callLlmForScore).toHaveBeenCalledTimes(1);
    expect(res.cached).toBe(false);
    expect(res.overall).toBe(75);
  });

  it("forceRegenerate 先清评分再重新生成", async () => {
    findScore.mockResolvedValue(null);
    await getOrGenerateAiScore(mockPoolForGeneration(), 1, 2, true);
    expect(removeScore).toHaveBeenCalledWith(1, 2);
    expect(callLlmForScore).toHaveBeenCalledTimes(1);
  });
});

describe("getOrGenerateAiScore 错误与格式守卫", () => {
  it("缓存 score_reasons 为坏 JSON → details 兜底空对象，不影响命中", async () => {
    findScore.mockResolvedValue({
      score_overall: 80, score_qualification: 80, score_experience: 80, score_certification: 80,
      score_region: 80, score_scale: 80, score_delivery: 80, score_price: 80,
      score_reasons: "{not-json", score_reasoning: "old",
    });
    const res = await getOrGenerateAiScore({} as any, 1, 2, false);
    expect(res.cached).toBe(true);
    expect(res.details).toEqual({});
  });

  it("缓存 score_reasons 为数组（历史脏数据）→ 不得当 details 使用", async () => {
    findScore.mockResolvedValue({
      score_overall: 80, score_qualification: 80, score_experience: 80, score_certification: 80,
      score_region: 80, score_scale: 80, score_delivery: 80, score_price: 80,
      score_reasons: "[]", score_reasoning: "",
    });
    const res = await getOrGenerateAiScore({} as any, 1, 2, false);
    expect(res.cached).toBe(true);
    expect(res.details).toEqual({});
  });

  it("LLM 配置缺失 → 40001 errLlmNotConfigured", async () => {
    findScore.mockResolvedValue(null);
    findActiveByUser.mockResolvedValue(null);
    await expect(getOrGenerateAiScore({} as any, 1, 2, false)).rejects.toMatchObject({ status: 400, code: 40001 });
  });

  it("API Key 解密失败 → 40001 errLlmNotConfigured", async () => {
    findScore.mockResolvedValue(null);
    decryptMock.mockImplementationOnce(() => { throw new Error("bad key"); });
    await expect(getOrGenerateAiScore(mockPoolForGeneration(), 1, 2, false)).rejects.toMatchObject({ status: 400, code: 40001 });
  });

  it("公告不存在 → 404 errNoticeNotFound", async () => {
    findScore.mockResolvedValue(null);
    const pool = { query: vi.fn().mockResolvedValue([[]]) } as any;
    await expect(getOrGenerateAiScore(pool, 1, 2, false)).rejects.toMatchObject({ status: 404, code: 40006 });
  });

  it("LLM 调用失败 → 502 errLlmCallFailed", async () => {
    findScore.mockResolvedValue(null);
    callLlmForScore.mockRejectedValue(new Error("LLM_HTTP_500"));
    await expect(getOrGenerateAiScore(mockPoolForGeneration(), 1, 2, false)).rejects.toMatchObject({ status: 502, code: 50002 });
  });

  it("生成成功 → upsertScore 落库并返回 cached:false", async () => {
    findScore.mockResolvedValue(null);
    const res = await getOrGenerateAiScore(mockPoolForGeneration(), 1, 2, false);
    expect(res.cached).toBe(false);
    expect(upsertScore).toHaveBeenCalledTimes(1);
    expect(upsertScore.mock.calls[0][0]).toMatchObject({ userId: 1, noticeId: 2, overall: 75, model: "m" });
  });

  it("用户未绑定企业（supplier_id=0）→ 无画像仍可生成", async () => {
    findScore.mockResolvedValue(null);
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
        .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]])
        .mockResolvedValueOnce([[{ supplier_id: 0 }]]),
    } as any;
    const res = await getOrGenerateAiScore(pool, 1, 2, false);
    expect(res.cached).toBe(false);
    expect(callLlmForScore).toHaveBeenCalledTimes(1);
  });

  it("supplier 表无记录 → 画像为 null，流程不中断", async () => {
    findScore.mockResolvedValue(null);
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
        .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]])
        .mockResolvedValueOnce([[{ supplier_id: 10 }]])
        .mockResolvedValueOnce([[]]),
    } as any;
    const res = await getOrGenerateAiScore(pool, 1, 2, false);
    expect(res.cached).toBe(false);
  });

  it("画像字段全为 NULL → 逐字段空串兜底", async () => {
    findScore.mockResolvedValue(null);
    const nulls = Object.fromEntries([
      "company", "industry", "products", "certification", "country", "city", "type",
      "registered_capital", "established_at", "intro", "employee_count", "export_scale",
      "service_countries", "overseas_companies", "ungm_status", "english_team",
      "payment_terms", "bid_willingness",
    ].map((k) => [k, null]));
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", country: "CN", deadline: 0, estimated_value: 0 }]])
        .mockResolvedValueOnce([[{ eligibility: "", technical_hurdles: "", supplier_conditions: "" }]])
        .mockResolvedValueOnce([[{ supplier_id: 10 }]])
        .mockResolvedValueOnce([[nulls]]),
    } as any;
    const res = await getOrGenerateAiScore(pool, 1, 2, false);
    expect(res.cached).toBe(false);
    expect(res.overall).toBe(75);
  });
});
