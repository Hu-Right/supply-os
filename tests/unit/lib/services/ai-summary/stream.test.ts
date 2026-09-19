/**
 * streamAiSummary 持久化回归测试
 * @module tests/unit/lib/services/ai-summary/stream.test.ts
 * @description 锁定修复：流式生成结束后必须 upsert 落库，否则"开始分析"结果刷新即丢失、
 *              缓存回读永远 miss、按钮反复出现。此前仅非流式 getOrGenerateAiSummary 会落库。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { find, upsert, callLlmStream, resolveCreds } = vi.hoisted(() => ({
  find: vi.fn(),
  upsert: vi.fn(),
  callLlmStream: vi.fn(),
  resolveCreds: vi.fn(),
}));

vi.mock("@/lib/repos/ai-summary.repo", () => ({
  AiSummaryRepo: function (this: any) {
    Object.assign(this, { find, upsert });
  },
}));
vi.mock("@/lib/services/ai-summary/doc-extractor", () => ({
  extractAttachmentsText: vi.fn(async () => ""),
}));
vi.mock("@/lib/services/ai/shared/llm-credentials", () => ({
  resolveLlmCredentials: resolveCreds,
}));
vi.mock("@/lib/services/ai-summary/prompt", () => ({
  SYSTEM_PROMPT: "sys",
  buildUserPrompt: vi.fn(() => "user"),
}));
// 仅替换流式调用，保留真实 parseAiSummaryResponse（验证解析失败时不落库）
vi.mock("@/lib/services/ai-summary/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ai-summary/llm-client")>();
  return { ...actual, callLlmForSummaryStream: callLlmStream };
});

import { streamAiSummary } from "@/lib/services/ai-summary";

const creds = { baseUrl: "https://x", apiKey: "k", model: "m" };

/**
 * 依序命中：fetchNoticeForPrompt → enrichFromOpportunity → fetchSupplierProfile(无 supplier)。
 * summaryRepo/credentials/prompt/llm 均已 mock，不消耗 pool.query。
 */
const pool = () => ({
  query: vi
    .fn()
    .mockResolvedValueOnce([[{ id: 1, title: "T", notice_type: "RFQ", agency: "A", country: "CN", deadline: 0, estimated_value: 0, description: "d", documents: null }]])
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[{ supplier_id: 0 }]]),
} as any);

beforeEach(() => {
  vi.clearAllMocks();
  resolveCreds.mockResolvedValue(creds);
  upsert.mockResolvedValue(undefined);
});

describe("streamAiSummary 持久化", () => {
  it("缓存命中：一次性返回完整 JSON，不调 LLM、不落库", async () => {
    find.mockResolvedValue({
      core_deliverables: "CD", key_qualifications: "KQ", payment_cycle: "PC",
      competitive_landscape: "CL", bid_strategy: "BS", risk_alerts: "RA", model: "m",
    });
    const chunks: string[] = [];
    for await (const c of streamAiSummary(pool(), 7, 1)) chunks.push(c);
    expect(JSON.parse(chunks[0]).coreDeliverables).toBe("CD");
    expect(callLlmStream).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("缓存未命中：流式结束后按 6 维度 upsert 落库", async () => {
    find.mockResolvedValue(null);
    callLlmStream.mockImplementation(async function* () {
      yield '{"coreDeliverables":"CD","keyQualifications":"KQ","paymentCycle":"PC",';
      yield '"competitiveLandscape":"CL","bidStrategy":"BS","riskAlerts":"RA"}';
    });
    const out: string[] = [];
    for await (const c of streamAiSummary(pool(), 7, 1)) out.push(c);
    // 原样透传给前端（不吞 chunk）
    expect(out.join("")).toContain("coreDeliverables");
    // 关键断言：结果已落库，下次进入即可命中缓存
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      userId: 7, noticeId: 1,
      coreDeliverables: "CD", keyQualifications: "KQ", paymentCycle: "PC",
      competitiveLandscape: "CL", bidStrategy: "BS", riskAlerts: "RA",
      model: "m", providerBaseUrl: "https://x",
    });
  });

  it("LLM 输出非法 JSON：解析失败静默降级，不落库", async () => {
    find.mockResolvedValue(null);
    callLlmStream.mockImplementation(async function* () {
      yield "这不是 JSON";
    });
    const out: string[] = [];
    for await (const c of streamAiSummary(pool(), 7, 1)) out.push(c);
    expect(out.join("")).toBe("这不是 JSON");
    expect(upsert).not.toHaveBeenCalled();
  });
});
