import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useListingStats } from "@/features/procurement/hooks/useListingStats";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

describe("useListingStats", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("初始状态返回 null", () => {
    mockApi.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useListingStats());
    expect(result.current).toBeNull();
  });

  it("成功加载后返回统计数据", async () => {
    mockApi.mockResolvedValueOnce({
      active: 5000, todayNew: 12, deadline_in_30d: 200,
      with_original_docs: 800, bridged: 50,
    });

    const { result } = renderHook(() => useListingStats());

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.active).toBe(5000);
    expect(result.current!.todayNew).toBe(12);
    expect(result.current!.deadline_in_30d).toBe(200);
    expect(result.current!.with_original_docs).toBe(800);
  });

  it("API 失败时保持 null", async () => {
    mockApi.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useListingStats());

    // 等待一帧让 catch 执行
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalled();
    });

    // 保持 null（无 setState 在 catch 中）
    expect(result.current).toBeNull();
  });

  it("缺失字段回退为 0", async () => {
    mockApi.mockResolvedValueOnce({ active: 100, bridged: 0 });

    const { result } = renderHook(() => useListingStats());

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.todayNew).toBe(0);
    expect(result.current!.deadline_in_30d).toBe(0);
    expect(result.current!.with_original_docs).toBe(0);
  });
});
