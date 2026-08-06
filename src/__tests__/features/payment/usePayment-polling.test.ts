import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePayment } from "@/features/payment/hooks/usePayment";

// ── Mock dependencies ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/core/payment", () => ({
  getAvailableProviders: () => [
    { provider: "mock" as const, label: "Mock Payment" },
    { provider: "alipay" as const, label: "Alipay" },
  ],
}));

const mockCreateOrder = vi.fn();
const mockGetOrderStatus = vi.fn();

vi.mock("@/features/payment/api", () => ({
  createOrder: (...args: any[]) => mockCreateOrder(...args),
  getOrderStatus: (...args: any[]) => mockGetOrderStatus(...args),
}));

describe("usePayment — polling & edge cases", () => {
  const defaultProps = {
    planCode: "pro_monthly",
    userKey: "uk_test",
    onPaymentSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Polling: order paid → step=success, onPaymentSuccess called ──
  it("transitions to success when polling returns paid status", async () => {
    const mockOrder = {
      order_no: "ORD-POLL-1",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    mockGetOrderStatus.mockResolvedValue({ ...mockOrder, status: "paid" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    // Wait for polling interval (3000ms) + resolution
    await waitFor(() => {
      expect(result.current.step).toBe("success");
    }, { timeout: 5000 });
    expect(defaultProps.onPaymentSuccess).toHaveBeenCalledWith("ORD-POLL-1");
  }, 8000);

  // ── 2. Polling: order closed → step=failed ──
  it("transitions to failed when polling returns closed status", async () => {
    const mockOrder = {
      order_no: "ORD-POLL-2",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    mockGetOrderStatus.mockResolvedValue({ ...mockOrder, status: "closed" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    await waitFor(() => {
      expect(result.current.step).toBe("failed");
      expect(result.current.error).toBe("paymentTimeoutError");
    }, { timeout: 5000 });
  }, 8000);

  // ── 3. Polling: order failed → step=failed ──
  it("transitions to failed when polling returns failed status", async () => {
    const mockOrder = {
      order_no: "ORD-POLL-3",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    mockGetOrderStatus.mockResolvedValue({ ...mockOrder, status: "failed" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    await waitFor(() => {
      expect(result.current.step).toBe("failed");
    }, { timeout: 5000 });
  }, 8000);

  // ── 4. Polling: network error during poll → silent, keeps waiting ──
  it("silently handles polling errors and continues polling", async () => {
    const mockOrder = {
      order_no: "ORD-POLL-4",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    // First poll throws, second returns paid
    mockGetOrderStatus
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ ...mockOrder, status: "paid" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    // Should eventually succeed after the transient error (needs 2 polling cycles = 6s)
    await waitFor(() => {
      expect(result.current.step).toBe("success");
    }, { timeout: 8000 });
  }, 12000);

  // ── 5. handleOpenPayUrl: no-op when orderInfo is null ──
  it("handleOpenPayUrl does nothing when no orderInfo", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() => usePayment(defaultProps));

    act(() => {
      result.current.handleOpenPayUrl();
    });

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  // ── 6. handleCopyPayUrl: no-op when orderInfo is null ──
  it("handleCopyPayUrl does nothing when no orderInfo", () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      writable: true,
    });

    const { result } = renderHook(() => usePayment(defaultProps));

    act(() => {
      result.current.handleCopyPayUrl();
    });

    expect(writeTextSpy).not.toHaveBeenCalled();
  });

  // ── 7. handleCreateOrder: error with no message uses fallback i18n key ──
  it("uses fallback error message when err.message is empty", async () => {
    mockCreateOrder.mockRejectedValue({ message: "" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    expect(result.current.error).toBe("paymentCreateError");
  });

  // ── 8. Cleanup: polling interval cleared on unmount ──
  it("clears polling interval on unmount", async () => {
    const mockOrder = {
      order_no: "ORD-CLEANUP",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    // Never resolves to keep polling active
    mockGetOrderStatus.mockImplementation(() => new Promise(() => {}));

    const { result, unmount } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    // Unmount should clear the interval without errors
    expect(() => unmount()).not.toThrow();
  }, 8000);

  // ── 9. Polling: orderInfo status updated to paid on success ──
  it("updates orderInfo status to paid when polling succeeds", async () => {
    const mockOrder = {
      order_no: "ORD-STATUS",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    mockGetOrderStatus.mockResolvedValue({ ...mockOrder, status: "paid" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    await waitFor(() => {
      expect(result.current.orderInfo?.status).toBe("paid");
    }, { timeout: 5000 });
  }, 8000);
});
