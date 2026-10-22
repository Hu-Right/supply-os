/**
 * AI 匹配 / 摘要 前端 wrapper 的裸载荷契约测试（2026-10 去信封迁移）
 * @module tests/unit/features/procurement/api/ai-clients
 * @description wrapper 是这两个端点的唯一出口，内部把响应交给 hook；本测试钉死：
 *              端点已改返裸载荷，wrapper 必须直接透传本体——若仍读 `{code:0,...}.data`
 *              会拿到 undefined（缓存判定恒 false / 匹配数据恒空）。
 *              仅 stub fetch，不触网络、不调任何真实 LLM。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAiMatchCache, fetchAiMatch } from "@/features/procurement/api/ai-match";
import { fetchAiSummaryCache, generateAiSummary } from "@/features/procurement/api/ai-summary";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ai-match wrapper · 裸载荷", () => {
  it("fetchAiMatchCache 直接返回裸缓存体（cached/top/diagPending），不再经 .data", async () => {
    const body = { cached: true, top: [{ supplier_id: 1 }], diagPending: 2 };
    fetchMock.mockResolvedValue(Response.json(body));
    const r = await fetchAiMatchCache(42);
    expect(r.cached).toBe(true);
    expect(r.diagPending).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/notices/42/ai-match"), expect.anything());
  });

  it("fetchAiMatch（POST）返回裸 AiMatchData 本体", async () => {
    const body = { top: [], cached: false, poolSize: 0, evaluated: 3, failed: 0, diagPending: 0 };
    fetchMock.mockResolvedValue(Response.json(body));
    const r = await fetchAiMatch(42, true);
    expect(r.evaluated).toBe(3);
    expect(r.cached).toBe(false);
  });
});

describe("ai-summary wrapper · 裸载荷", () => {
  it("fetchAiSummaryCache：cached=true 返回裸本体；cached=false 返回 null", async () => {
    fetchMock.mockResolvedValue(Response.json({ cached: true, coreDeliverables: "A" }));
    const hit = await fetchAiSummaryCache(7);
    expect(hit?.coreDeliverables).toBe("A");

    fetchMock.mockResolvedValue(Response.json({ cached: false }));
    const miss = await fetchAiSummaryCache(7);
    expect(miss).toBeNull();
  });

  it("generateAiSummary（POST）返回裸 AiSummaryResponse 本体", async () => {
    const body = {
      coreDeliverables: "A", keyQualifications: "B", paymentCycle: "C",
      competitiveLandscape: "D", bidStrategy: "E", riskAlerts: "F",
      model: "m", cached: false, inputTokens: 1, outputTokens: 2,
    };
    fetchMock.mockResolvedValue(Response.json(body));
    const r = await generateAiSummary(7);
    expect(r.bidStrategy).toBe("E");
  });
});
