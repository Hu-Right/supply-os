/**
 * useAwardsData 单测：三态区分（loading / error / empty）
 *
 * @module tests/unit/features/procurement/hooks/useAwardsData
 * @description 中标情报非关键路径，但 ARCHITECTURE.md 异常态要求「每个数据获取点必须区分
 *              loading/error/empty」。旧实现用 .catch(()=>null) 把接口失败与库为空压成同一
 *              结果，用户无从区分「还没数据」与「出错了」。本测试锁定新契约：
 *              - loading：初始 true，落定 false
 *              - error：任一请求 reject → true；成功返回（哪怕空库）→ false
 *              - empty：成功但 stats.total=0 → hasRealData=false, error=false
 *              - refetch：手动触发再次取数（force 跳缓存）
 * 桩同 useHotTopics：@/core/http 只暴露 apiCached。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAwardsData } from "@/features/procurement/hooks/useAwardsData";

const mockApiCached = vi.fn();
vi.mock("@/core/http", () => ({
  apiCached: (...args: unknown[]) => mockApiCached(...args),
}));

/** 按端点路由桩返回值 */
function routeStatsTopList(stats: unknown, topItems: unknown, listItems: unknown) {
  mockApiCached.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith("/api/awards/stats")) return Promise.resolve(stats);
    if (endpoint.startsWith("/api/awards/top")) return Promise.resolve({ items: topItems });
    if (endpoint.startsWith("/api/awards")) return Promise.resolve({ items: listItems, total: (listItems as unknown[]).length });
    return Promise.resolve(null);
  });
}

const oneWinner = [{ name: "甲公司", country: "中国", count: 3, totalUsd: 0 }];
const oneAward = [
  {
    id: 1,
    title: "某中标公告",
    titleCn: null,
    reference: null,
    agency: "中国政府采购网",
    country: "中国",
    awardDate: null,
    contractValueUsd: null,
    currency: "CNY",
    category: null,
    sourcePlatform: "ccgp",
  },
];

describe("useAwardsData · 三态区分", () => {
  afterEach(() => mockApiCached.mockReset());

  it("初始 loading=true, error=false", () => {
    mockApiCached.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAwardsData());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.hasRealData).toBe(false);
  });

  it("成功加载真数据：hasRealData=true, loading=false, error=false", async () => {
    routeStatsTopList(
      { total: 1669, totalValueUsd: 0, byAgency: [], byCountry: [], byMonth: [], topWinners: [] },
      oneWinner,
      oneAward,
    );
    const { result } = renderHook(() => useAwardsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasRealData).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.topWinners).toEqual(oneWinner);
    expect(result.current.recentAwards).toEqual(oneAward);
  });

  it("空库（成功但无记录）：hasRealData=false, error=false —— 空态不是错误", async () => {
    routeStatsTopList(
      { total: 0, totalValueUsd: 0, byAgency: [], byCountry: [], byMonth: [], topWinners: [] },
      [],
      [],
    );
    const { result } = renderHook(() => useAwardsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasRealData).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("接口失败：error=true, hasRealData=false, loading=false —— 错误不再伪装成空态", async () => {
    mockApiCached.mockRejectedValue(new Error("500 boom"));
    const { result } = renderHook(() => useAwardsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.hasRealData).toBe(false);
  });

  it("部分失败（stats 成功、top 失败）：hasRealData=true 且 error=true（有数据但标记异常）", async () => {
    mockApiCached.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/api/awards/stats"))
        return Promise.resolve({ total: 10, totalValueUsd: 0, byAgency: [], byCountry: [], byMonth: [], topWinners: [] });
      return Promise.reject(new Error("top down"));
    });
    const { result } = renderHook(() => useAwardsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasRealData).toBe(true);
    expect(result.current.error).toBe(true);
  });

  it("refetch 触发再次取数（force 跳缓存）", async () => {
    routeStatsTopList(
      { total: 1, totalValueUsd: 0, byAgency: [], byCountry: [], byMonth: [], topWinners: [] },
      oneWinner,
      oneAward,
    );
    const { result } = renderHook(() => useAwardsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockApiCached.mock.calls.length;
    act(() => result.current.refetch());
    await waitFor(() => expect(mockApiCached.mock.calls.length).toBeGreaterThan(callsBefore));
    // force=true：refetch 的调用第 4 个实参应为 true
    const forceArgs = mockApiCached.mock.calls.map((c) => c[3]);
    expect(forceArgs).toContain(true);
  });
});
