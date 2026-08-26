/**
 * server/services/search-orchestrator/meili-query.ts 测试
 * 验证 Meilisearch 查询封装：meiliQuery + meiliMultiQuery
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock meilisearch 依赖
vi.mock("../../../../server/services/meilisearch/client", () => ({
  getClient: vi.fn(),
  isHealthy: vi.fn().mockReturnValue(true),
  getIndexName: vi.fn().mockReturnValue("test_index"),
  markUnhealthy: vi.fn(),
  tryRecover: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../../../server/utils/notice-expired", () => ({
  MEILI_ACTIVE_FILTER: "deadline_sec > {now}",
}));

import { meiliQuery, meiliMultiQuery } from "../../../../server/services/search-orchestrator/meili-query";
import { getClient, isHealthy, markUnhealthy, tryRecover } from "../../../../server/services/meilisearch/client";

function createMockClient(searchResult?: any) {
  return {
    index: vi.fn().mockReturnValue({
      search: vi.fn().mockResolvedValue(searchResult || {
        hits: [{ id: "1" }, { id: "2" }],
        totalHits: 100,
        estimatedTotalHits: 100,
      }),
    }),
    multiSearch: vi.fn().mockResolvedValue({
      results: [{
        hits: [{ id: "1" }],
        totalHits: 50,
        estimatedTotalHits: 50,
      }],
    }),
  };
}

describe("meiliQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isHealthy).mockReturnValue(true);
  });

  it("client 为 null → 返回 null", async () => {
    vi.mocked(getClient).mockReturnValue(null);
    const result = await meiliQuery("test", [], "latest", 1, 20);
    expect(result).toBeNull();
  });

  it("不健康 + 恢复失败 → 返回 null", async () => {
    vi.mocked(getClient).mockReturnValue(createMockClient() as any);
    vi.mocked(isHealthy).mockReturnValue(false);
    vi.mocked(tryRecover).mockResolvedValue(false);
    const result = await meiliQuery("test", [], "latest", 1, 20);
    expect(result).toBeNull();
  });

  it("正常查询 → 返回 ids + total", async () => {
    vi.mocked(getClient).mockReturnValue(createMockClient() as any);
    const result = await meiliQuery("test", ["country = \"US\""], "latest", 1, 20);
    expect(result).not.toBeNull();
    expect(result!.ids).toEqual([1, 2]);
    expect(result!.total).toBe(100);
    expect(result!.totalIsPrecise).toBe(true);
  });

  it("sort=deadline → 排序映射", async () => {
    const mockClient = createMockClient();
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    await meiliQuery("test", [], "deadline", 1, 20);
    const searchCall = mockClient.index().search.mock.calls[0];
    expect(searchCall[1].sort).toContain("has_deadline:desc");
    expect(searchCall[1].sort).toContain("deadline_sec:asc");
  });

  it("sort=default → 默认排序", async () => {
    const mockClient = createMockClient();
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    await meiliQuery("test", [], "deadline_farthest", 1, 20);
    const searchCall = mockClient.index().search.mock.calls[0];
    expect(searchCall[1].sort).toContain("deadline_sec:desc");
  });

  it("分页参数 → offset 计算", async () => {
    const mockClient = createMockClient();
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    await meiliQuery("test", [], "latest", 3, 10);
    const searchCall = mockClient.index().search.mock.calls[0];
    expect(searchCall[1].offset).toBe(20); // (3-1) * 10
    expect(searchCall[1].limit).toBe(10);
  });

  it("查询异常（非超时）→ markUnhealthy + 返回 null", async () => {
    const mockClient = createMockClient();
    mockClient.index().search.mockRejectedValue(new Error("connection refused"));
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    const result = await meiliQuery("test", [], "latest", 1, 20);
    expect(result).toBeNull();
    expect(markUnhealthy).toHaveBeenCalled();
  });

  it("查询超时 → 不标记不健康（避免死循环）", async () => {
    const mockClient = createMockClient();
    mockClient.index().search.mockRejectedValue(new Error("search timeout exceeded"));
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    const result = await meiliQuery("test", [], "latest", 1, 20);
    expect(result).toBeNull();
    expect(markUnhealthy).not.toHaveBeenCalled();
  });

  it("estimatedTotalHits 回退", async () => {
    const mockClient = createMockClient({
      hits: [{ id: "1" }],
      estimatedTotalHits: 42,
    });
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    const result = await meiliQuery("", [], "latest", 1, 20);
    expect(result!.total).toBe(42);
    expect(result!.totalIsPrecise).toBe(false);
  });
});

describe("meiliMultiQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isHealthy).mockReturnValue(true);
  });

  it("client 为 null → 返回 null", async () => {
    vi.mocked(getClient).mockReturnValue(null);
    const result = await meiliMultiQuery("test", [[]], "latest");
    expect(result).toBeNull();
  });

  it("正常多查询 → 返回结果数组", async () => {
    vi.mocked(getClient).mockReturnValue(createMockClient() as any);
    const result = await meiliMultiQuery("test", [["country = US"], ["country = CN"]], "latest");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1); // mock 只返回 1 个结果
  });

  it("查询异常 → 返回 null", async () => {
    const mockClient = createMockClient();
    mockClient.multiSearch.mockRejectedValue(new Error("network error"));
    vi.mocked(getClient).mockReturnValue(mockClient as any);
    const result = await meiliMultiQuery("test", [[]], "latest");
    expect(result).toBeNull();
    expect(markUnhealthy).toHaveBeenCalled();
  });
});
