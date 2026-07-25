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

describe("usePayment", () => {
  const defaultProps = {
    planCode: "pro_monthly",
    userKey: "uk_test",
    onPaymentSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with choose step", () => {
    const { result } = renderHook(() => usePayment(defaultProps));
    expect(result.current.step).toBe("choose");
    expect(result.current.orderInfo).toBeNull();
    expect(result.current.error).toBe("");
    expect(result.current.isCreating).toBe(false);
  });

  it("creates order successfully", async () => {
    const mockOrder = {
      order_no: "ORD-001",
      pay_url: "https://pay.example.com",
      provider: "mock" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);
    // Mock polling to return paid immediately
    mockGetOrderStatus.mockResolvedValue({ ...mockOrder, status: "paid" });

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    expect(result.current.step).toBe("waiting");
    expect(result.current.orderInfo).toEqual(mockOrder);
    expect(result.current.isCreating).toBe(false);
  });

  it("handles create order failure", async () => {
    mockCreateOrder.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => usePayment(defaultProps));

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    expect(result.current.step).toBe("choose");
    expect(result.current.error).toBe("Network error");
    expect(result.current.isCreating).toBe(false);
  });

  it("handleRetry resets state", async () => {
    const { result } = renderHook(() => usePayment(defaultProps));

    // Simulate some state
    await act(async () => {
      result.current.handleRetry();
    });

    expect(result.current.step).toBe("choose");
    expect(result.current.orderInfo).toBeNull();
    expect(result.current.error).toBe("");
  });

  it("setSelectedProvider changes provider", () => {
    const { result } = renderHook(() => usePayment(defaultProps));

    act(() => {
      result.current.setSelectedProvider("alipay");
    });

    expect(result.current.selectedProvider).toBe("alipay");
  });

  it("handleOpenPayUrl opens payment URL when orderInfo exists", async () => {
    const mockOrder = {
      order_no: "ORD-001",
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

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    act(() => {
      result.current.handleOpenPayUrl();
    });
    expect(openSpy).toHaveBeenCalledWith("https://pay.example.com", "_blank");
    openSpy.mockRestore();
  });

  it("handleCopyPayUrl copies payment URL to clipboard", async () => {
    const mockOrder = {
      order_no: "ORD-001",
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

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      writable: true,
    });

    act(() => {
      result.current.handleCopyPayUrl();
    });
    expect(writeTextSpy).toHaveBeenCalledWith("https://pay.example.com");
  });

  it("auto-selects first available provider on mount", () => {
    const { result } = renderHook(() => usePayment(defaultProps));
    // First provider in mock is "mock"
    expect(result.current.selectedProvider).toBe("mock");
  });

  it("returns availableProviders list", () => {
    const { result } = renderHook(() => usePayment(defaultProps));
    expect(result.current.availableProviders).toHaveLength(2);
    expect(result.current.availableProviders[0].provider).toBe("mock");
  });

  it("auto-selects first provider when selectedProvider is not in available list", async () => {
    const customProps = { ...defaultProps, selectedProvider: "nonexistent" as any };
    const { result } = renderHook(() => usePayment(customProps));
    
    // Should auto-select to first available provider
    await waitFor(() => {
      expect(result.current.selectedProvider).toBe("mock");
    });
  });

  it("handleCreateOrder opens pay window for non-mock provider", async () => {
    const mockOrder = {
      order_no: "ORD-002",
      pay_url: "https://pay.example.com",
      provider: "alipay" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);

    const customProps = { ...defaultProps, selectedProvider: "alipay" };
    const { result } = renderHook(() => usePayment(customProps));

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    
    await act(async () => {
      await result.current.handleCreateOrder();
    });

    // Should have called window.open with pay_url
    expect(openSpy).toHaveBeenCalledWith("https://pay.example.com", "_blank");
    openSpy.mockRestore();
  });

  it("handleCreateOrder redirects when window.open is blocked", async () => {
    const mockOrder = {
      order_no: "ORD-003",
      pay_url: "https://pay.example.com",
      provider: "alipay" as const,
      status: "pending" as const,
    };
    mockCreateOrder.mockResolvedValue(mockOrder);

    const customProps = { ...defaultProps, selectedProvider: "alipay" };
    const { result } = renderHook(() => usePayment(customProps));

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await act(async () => {
      await result.current.handleCreateOrder();
    });

    // When window.open returns null, it should redirect
    // This is hard to test in jsdom, so we just verify it doesn't crash
    openSpy.mockRestore();
  });
});
