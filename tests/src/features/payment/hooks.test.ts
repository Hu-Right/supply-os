/**
 * src/features/payment/hooks/ 测试
 * 覆盖 useOrderHistory, useRecordsSummary
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mock payment api ──
const fetchOrdersMock = vi.fn();
const fetchUnlocksMock = vi.fn();
vi.mock("@/features/payment/api", () => ({
  fetchOrders: (...args: any[]) => fetchOrdersMock(...args),
  fetchUnlocks: (...args: any[]) => fetchUnlocksMock(...args),
}));

import { useOrderHistory } from "@/features/payment/hooks/useOrderHistory";
import { useRecordsSummary } from "@/features/payment/hooks/useRecordsSummary";

describe("useOrderHistory", () => {
  beforeEach(() => {
    fetchOrdersMock.mockReset();
    fetchUnlocksMock.mockReset();
  });

  it("userKey 为空 → 不加载数据", () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 0 });
    const { result } = renderHook(() => useOrderHistory(undefined));
    expect(result.current.orders).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("初始 tab=orders, page=1, limit=10", () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 0 });
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    expect(result.current.tab).toBe("orders");
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(10);
  });

  it("加载订单数据", async () => {
    const mockData = { list: [{ id: 1, order_no: "ORD-1" }], total: 1 };
    fetchOrdersMock.mockResolvedValue(mockData);
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders).toEqual(mockData);
  });

  it("setTab 切换 tab + 重置 page", async () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 0 });
    fetchUnlocksMock.mockResolvedValue({ list: [{ id: 1 }], total: 1 });
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTab("unlocks"));
    expect(result.current.tab).toBe("unlocks");
    expect(result.current.page).toBe(1);
  });

  it("total=0 → totalPages=1", async () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 0 });
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalPages).toBe(1);
  });

  it("total=25 → totalPages=3", async () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 25 });
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(25);
    expect(result.current.totalPages).toBe(3);
  });

  it("加载失败 → error=load_failed", async () => {
    fetchOrdersMock.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useOrderHistory("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("load_failed");
  });
});

describe("useRecordsSummary", () => {
  beforeEach(() => {
    fetchOrdersMock.mockReset();
    fetchUnlocksMock.mockReset();
  });

  it("userKey 为空 → 全部归零", () => {
    const { result } = renderHook(() => useRecordsSummary(undefined));
    expect(result.current.ordersTotal).toBe(0);
    expect(result.current.unlocksTotal).toBe(0);
    expect(result.current.ordersFirst).toBeNull();
    expect(result.current.unlocksFirst).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("加载订单+解锁摘要", async () => {
    fetchOrdersMock.mockResolvedValue({
      list: [{ id: 1, order_no: "ORD-1" }],
      total: 5,
    });
    fetchUnlocksMock.mockResolvedValue({
      list: [{ id: 10, notice_id: 100 }],
      total: 3,
    });
    const { result } = renderHook(() => useRecordsSummary("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ordersTotal).toBe(5);
    expect(result.current.unlocksTotal).toBe(3);
    expect(result.current.ordersFirst).toEqual({ id: 1, order_no: "ORD-1" });
    expect(result.current.unlocksFirst).toEqual({ id: 10, notice_id: 100 });
  });

  it("部分失败 → 仅成功方有值", async () => {
    fetchOrdersMock.mockResolvedValue({ list: [], total: 2 });
    fetchUnlocksMock.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useRecordsSummary("user@test.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ordersTotal).toBe(2);
    expect(result.current.unlocksTotal).toBe(0);
  });
});
