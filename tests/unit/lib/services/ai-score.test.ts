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

vi.mock("@/lib/services/ai-summary/crypto", () => ({ decryptApiKey: () => "plain-key" }));

vi.mock("@/lib/services/ai-score/llm-client", () => ({ callLlmForScore }));

import { getOrGenerateAiScore } from "@/lib/services/ai-score";

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
