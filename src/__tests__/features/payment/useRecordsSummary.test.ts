import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRecordsSummary } from "@/features/payment/hooks/useRecordsSummary";
import { fetchOrders, fetchUnlocks } from "@/features/payment/api";
import type { OrderRecord, UnlockRecord, PagedResult } from "@/features/payment/api";

vi.mock("@/features/payment/api", () => ({
  fetchOrders: vi.fn(),
  fetchUnlocks: vi.fn(),
}));

const mockedFetchOrders = vi.mocked(fetchOrders);
const mockedFetchUnlocks = vi.mocked(fetchUnlocks);

const orderRecord = (orderNo: string): OrderRecord => ({
  order_no: orderNo,
  user_key: "uk_test",
  provider: "mock",
  plan_code: "annual",
  amount: 5600,
  currency: "CNY",
  status: "paid",
});

const unlockRecord = (noticeId: number): UnlockRecord => ({
  user_key: "uk_test",
  notice_id: noticeId,
  unlock_type: "paid",
  price: 89,
});

const pagedOrders = (total: number, list: OrderRecord[] = []): PagedResult<OrderRecord> => ({
  total,
  page: 1,
  limit: 1,
  list,
});

const pagedUnlocks = (total: number, list: UnlockRecord[] = []): PagedResult<UnlockRecord> => ({
  total,
  page: 1,
  limit: 1,
  list,
});

describe("useRecordsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch without a userKey and keeps zeroed state", async () => {
    const { result } = renderHook(() => useRecordsSummary(undefined));
    expect(mockedFetchOrders).not.toHaveBeenCalled();
    expect(mockedFetchUnlocks).not.toHaveBeenCalled();
    expect(result.current.ordersTotal).toBe(0);
    expect(result.current.unlocksTotal).toBe(0);
    expect(result.current.ordersFirst).toBeNull();
    expect(result.current.unlocksFirst).toBeNull();
  });

  it("fetches page 1 with limit 1 from both endpoints in parallel", async () => {
    mockedFetchOrders.mockResolvedValue(pagedOrders(5, [orderRecord("ORD-1")]));
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(3, [unlockRecord(42)]));

    const { result } = renderHook(() => useRecordsSummary("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedFetchOrders).toHaveBeenCalledWith({ userKey: "uk_test", page: 1, limit: 1 });
    expect(mockedFetchUnlocks).toHaveBeenCalledWith({ userKey: "uk_test", page: 1, limit: 1 });
    expect(result.current.ordersTotal).toBe(5);
    expect(result.current.unlocksTotal).toBe(3);
    expect(result.current.ordersFirst).toMatchObject({ order_no: "ORD-1" });
    expect(result.current.unlocksFirst).toMatchObject({ notice_id: 42 });
  });

  it("keeps the other side intact when one endpoint fails", async () => {
    mockedFetchOrders.mockRejectedValue(new Error("boom"));
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(2, [unlockRecord(7)]));

    const { result } = renderHook(() => useRecordsSummary("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.ordersTotal).toBe(0);
    expect(result.current.ordersFirst).toBeNull();
    expect(result.current.unlocksTotal).toBe(2);
    expect(result.current.unlocksFirst).toMatchObject({ notice_id: 7 });
  });

  it("treats empty lists as null first records", async () => {
    mockedFetchOrders.mockResolvedValue(pagedOrders(0));
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(0));

    const { result } = renderHook(() => useRecordsSummary("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ordersFirst).toBeNull();
    expect(result.current.unlocksFirst).toBeNull();
  });

  it("refresh re-runs both requests", async () => {
    mockedFetchOrders.mockResolvedValue(pagedOrders(0));
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(0));

    const { result } = renderHook(() => useRecordsSummary("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refresh());
    await waitFor(() => expect(mockedFetchOrders).toHaveBeenCalledTimes(2));
    expect(mockedFetchUnlocks).toHaveBeenCalledTimes(2);
  });
});
