import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHotTopics } from "@/features/home/hooks/useHotTopics";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const mockTopics = {
  countries: [{ country: "CN", count: 100 }, { country: "US", count: 80 }],
  industries: [{ id: 1, code: "42100000", title_zh: "医疗", title: "Medical", count: 50 }],
};

describe("useHotTopics", () => {
  afterEach(() => {
    mockApi.mockReset();
  });

  it("初始状态 loading=true, topics=null, error=false", () => {
    mockApi.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useHotTopics());
    expect(result.current.loading).toBe(true);
    expect(result.current.topics).toBeNull();
    expect(result.current.error).toBe(false);
  });

  it("成功加载后 topics 有值，loading=false, error=false", async () => {
    mockApi.mockResolvedValueOnce(mockTopics);
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toEqual(mockTopics);
    expect(result.current.error).toBe(false);
  });

  it("API 失败时 error=true, topics=null, loading=false", async () => {
    mockApi.mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toBeNull();
    expect(result.current.error).toBe(true);
  });

  it("返回空数据时 topics 为空数组而非 null", async () => {
    mockApi.mockResolvedValueOnce({ countries: [], industries: [] });
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toEqual({ countries: [], industries: [] });
    expect(result.current.error).toBe(false);
  });
});
