/**
 * AI 智能匹配服务测试
 * @module tests/unit/lib/services/ai-match.test.ts
 * @description 验证匹配缓存走 match_results 独立列，不再读写评分 score_* / score_reasons。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMatch, upsertMatch, findScore, upsertScore, findActiveByUser, fetchSupplierProfiles, callLlmForScore } = vi.hoisted(() => ({
  findMatch: vi.fn(),
  upsertMatch: vi.fn(),
  findScore: vi.fn(),
  upsertScore: vi.fn(),
  findActiveByUser: vi.fn(),
  fetchSupplierProfiles: vi.fn(),
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
    Object.assign(this, { fetchSupplierProfiles });
  },
}));

vi.mock("@/lib/services/ai-summary/crypto", () => ({ decryptApiKey: () => "plain-key" }));

vi.mock("@/lib/services/ai-score/llm-client", () => ({ callLlmForScore }));

import { getOrGenerateAiMatch } from "@/lib/services/ai-match";

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
});

describe("getOrGenerateAiMatch 缓存分键", () => {
  it("match_results 命中 → 直接返回，不调用评分缓存/LLM", async () => {
    findMatch.mockResolvedValue({ match_results: JSON.stringify([{ pool_id: 5, supplier_id: 10, company: "工厂A", overall: 88, details: {} }]) });
    const res = await getOrGenerateAiMatch({} as any, 1, 2, false);
    expect(res.cached).toBe(true);
    expect(res.top[0].overall).toBe(88);
    expect(findScore).not.toHaveBeenCalled();
    expect(callLlmForScore).not.toHaveBeenCalled();
  });

  it("生成后写 match_results，不触碰评分列", async () => {
    findMatch.mockResolvedValue(null);
    fetchSupplierProfiles.mockResolvedValue([supplierRow]);
    const res = await getOrGenerateAiMatch(noticePool(), 1, 2, false);
    expect(res.top).toHaveLength(1);
    expect(upsertMatch).toHaveBeenCalledTimes(1);
    expect(upsertScore).not.toHaveBeenCalled();
    expect(findScore).not.toHaveBeenCalled();
  });
});
