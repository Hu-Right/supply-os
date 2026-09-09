import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHomeStats } from "@/features/home/hooks/useHomeStats";

// Mock @/core/http 的 api 函数
const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

describe("useHomeStats", () => {
  afterEach(() => {
    mockApi.mockReset();
    vi.restoreAllMocks();
  });

  function mockSuccess() {
    mockApi
      .mockResolvedValueOnce({ active: 12500, todayNew: 42 })         // /api/notices/stats
      .mockResolvedValueOnce([{ country: "CN" }, { country: "US" }]) // /api/notices/countries
      .mockResolvedValueOnce({ total: 380 });                         // /api/suppliers
  }

  it("初始状态 loading=true，所有数值为 0", () => {
    mockApi.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useHomeStats());
    expect(result.current.loading).toBe(true);
    expect(result.current.noticeActive).toBe(0);
    expect(result.current.countryCount).toBe(0);
  });

  it("成功加载后更新数据并设置 loading=false", async () => {
    mockSuccess();
    const { result } = renderHook(() => useHomeStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.noticeActive).toBe(12500);
    expect(result.current.noticeTodayNew).toBe(42);
    expect(result.current.countryCount).toBe(2);
    expect(result.current.certifiedSupplierCount).toBe(380);
  });

  it("API 全部失败时保持零值并结束 loading", async () => {
    mockApi.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useHomeStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.noticeActive).toBe(0);
    expect(result.current.noticeTodayNew).toBe(0);
    expect(result.current.countryCount).toBe(0);
    expect(result.current.certifiedSupplierCount).toBe(0);
  });

  it("todayNew 缺失时回退为 0", async () => {
    mockApi
      .mockResolvedValueOnce({ active: 100 }) // 无 todayNew 字段
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ total: 0 });

    const { result } = renderHook(() => useHomeStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.noticeTodayNew).toBe(0);
  });
});
