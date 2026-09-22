/**
 * AI 摘要/评分/匹配缓存仓储测试
 * @module tests/unit/lib/repos/ai-summary.repo.test.ts
 * @description 验证评分与匹配缓存分键（match_results 独立列），以及 removeScore 清理完整性。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";

describe("AiSummaryRepo 缓存分键", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: AiSummaryRepo;

  beforeEach(() => {
    repo = new AiSummaryRepo(mockPool);
    mockQuery.mockReset();
  });

  it("upsertMatch 只写 match_results，不触碰评分列", async () => {
    mockQuery.mockResolvedValue([{}]);
    await repo.upsertMatch({
      userId: 1, noticeId: 2,
      matchResults: JSON.stringify([{ pool_id: 9, overall: 88 }]),
      model: "m", providerBaseUrl: "https://x",
    });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("match_results");
    expect(sql).not.toContain("score_overall");
    expect(sql).not.toContain("score_reasons");
  });

  it("findMatch 读取 match_results 列", async () => {
    mockQuery.mockResolvedValue([[{ match_results: "[]", model: "m" }]]);
    const row = await repo.findMatch(1, 2);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("match_results");
    expect(row?.match_results).toBe("[]");
  });

  it("removeScore 同时清空 score_reasoning（修复漏清）", async () => {
    mockQuery.mockResolvedValue([{}]);
    await repo.removeScore(1, 2);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("score_reasons = NULL");
    expect(sql).toContain("score_reasoning = NULL");
  });
});
