import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useOrderHistory } from "@/features/payment/hooks/useOrderHistory";
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
  limit: 10,
  list,
});

const pagedUnlocks = (total: number, list: UnlockRecord[] = []): PagedResult<UnlockRecord> => ({
  total,
  page: 1,
  limit: 10,
  list,
});

describe("useOrderHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchOrders.mockResolvedValue(pagedOrders(0));
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(0));
  });

  it("does not fetch without a userKey and keeps data cleared", async () => {
    const { result } = renderHook(() => useOrderHistory(undefined));
    expect(mockedFetchOrders).not.toHaveBeenCalled();
    expect(result.current.orders).toBeNull();
    expect(result.current.unlocks).toBeNull();
    expect(result.current.total).toBe(0);
  });

  it("loads orders page 1 with PAGE_LIMIT=10 by default", async () => {
    mockedFetchOrders.mockResolvedValue(
      pagedOrders(2, [orderRecord("ORD-1"), orderRecord("ORD-2")])
    );
    const { result } = renderHook(() => useOrderHistory("uk_test"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedFetchOrders).toHaveBeenCalledWith({ userKey: "uk_test", page: 1, limit: 10 });
    expect(mockedFetchUnlocks).not.toHaveBeenCalled();
    expect(result.current.tab).toBe("orders");
    expect(result.current.orders?.list).toHaveLength(2);
    expect(result.current.total).toBe(2);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.limit).toBe(10);
  });

  it("switching tab resets page to 1 and loads unlocks", async () => {
    mockedFetchUnlocks.mockResolvedValue(pagedUnlocks(1, [unlockRecord(42)]));
    const { result } = renderHook(() => useOrderHistory("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(3));
    act(() => result.current.setTab("unlocks"));
    expect(result.current.page).toBe(1);

    await waitFor(() => expect(mockedFetchUnlocks).toHaveBeenCalled());
    expect(mockedFetchUnlocks).toHaveBeenLastCalledWith({ userKey: "uk_test", page: 1, limit: 10 });
    await waitFor(() => expect(result.current.unlocks?.list[0]?.notice_id).toBe(42));
  });

  it("setPage triggers a new request for the given page", async () => {
    const { result } = renderHook(() => useOrderHistory("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() =>
      expect(mockedFetchOrders).toHaveBeenCalledWith({ userKey: "uk_test", page: 2, limit: 10 })
    );
  });

  it("computes totalPages from total (ceil, min 1)", async () => {
    mockedFetchOrders.mockResolvedValue(pagedOrders(25));
    const { result } = renderHook(() => useOrderHistory("uk_test"));
    await waitFor(() => expect(result.current.totalPages).toBe(3));
  });

  it("sets error=load_failed and clears loading on failure", async () => {
    mockedFetchOrders.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useOrderHistory("uk_test"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("load_failed");
  });

  it("ignores stale responses from earlier requests (race guard)", async () => {
    let resolveFirst!: (value: PagedResult<OrderRecord>) => void;
    mockedFetchOrders.mockImplementationOnce(
      () =>
        new Promise<PagedResult<OrderRecord>>((resolve) => {
          resolveFirst = resolve;
        })
    );
    mockedFetchOrders.mockResolvedValue(pagedOrders(7));

    const { result } = renderHook(() => useOrderHistory("uk_test"));
    // 第一次请求尚在途时翻页触发第二次请求
    act(() => result.current.setPage(2));
    await waitFor(() => expect(mockedFetchOrders).toHaveBeenCalledTimes(2));

    // 第一次请求姗姗来迟：不应覆盖第二次的结果
    act(() => resolveFirst(pagedOrders(99)));
    await waitFor(() => expect(result.current.orders?.total).toBe(7));
  });

  it("refresh reloads the current tab", async () => {
    const { result } = renderHook(() => useOrderHistory("uk_test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refresh());
    await waitFor(() => expect(mockedFetchOrders).toHaveBeenCalledTimes(2));
  });

  it("clears data when userKey disappears", async () => {
    const { result, rerender } = renderHook(
      ({ userKey }: { userKey?: string }) => useOrderHistory(userKey),
      { initialProps: { userKey: "uk_test" } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ userKey: undefined });
    expect(result.current.orders).toBeNull();
    expect(result.current.unlocks).toBeNull();
  });
});
