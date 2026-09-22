import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useListingStats } from "@/features/procurement/hooks/useListingStats";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// 契约说明（43998b19）：hook 始终返回零值起点的统计对象，不再返回 null——
// 卡片网格常驻渲染避免加载完成时布局跳动；加载中/失败与真实零值在数值上
// 不可区分，badge 由消费方以 active>0 控制。缺失字段回退为 0。
const ZERO_STATS = {
  active: 0,
  todayNew: 0,
  yesterdayNew: 0,
  deadline_in_30d: 0,
  with_original_docs: 0,
};

describe("useListingStats", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("初始状态返回零值占位对象（常驻卡片防布局跳动）", () => {
    mockApi.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useListingStats());
    expect(result.current).toEqual(ZERO_STATS);
  });

  it("成功加载后返回统计数据", async () => {
    mockApi.mockResolvedValueOnce({
      active: 5000, todayNew: 12, deadline_in_30d: 200,
      with_original_docs: 800, bridged: 50,
    });

    const { result } = renderHook(() => useListingStats());

    await waitFor(() => {
      expect(result.current.active).toBe(5000);
    });

    expect(result.current.todayNew).toBe(12);
    expect(result.current.deadline_in_30d).toBe(200);
    expect(result.current.with_original_docs).toBe(800);
  });

  it("API 失败时保持零值占位（不渲染脏数据）", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useListingStats());

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalled();
    });

    expect(result.current).toEqual(ZERO_STATS);
    warnSpy.mockRestore();
  });

  it("缺失字段回退为 0", async () => {
    mockApi.mockResolvedValueOnce({ active: 100, bridged: 0 });

    const { result } = renderHook(() => useListingStats());

    await waitFor(() => {
      expect(result.current.active).toBe(100);
    });

    expect(result.current.todayNew).toBe(0);
    expect(result.current.deadline_in_30d).toBe(0);
    expect(result.current.with_original_docs).toBe(0);
  });
});
