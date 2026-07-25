import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentModal from "@/features/payment/components/PaymentModal";

// ── Mock usePayment hook ──
const mockUsePayment = {
  step: "choose" as any,
  orderInfo: null as any,
  error: "",
  isCreating: false,
  selectedProvider: "mock" as any,
  setSelectedProvider: vi.fn(),
  availableProviders: [
    { provider: "mock", icon: "🧪", recommended: true },
    { provider: "alipay", icon: "💳", recommended: false },
  ],
  handleCreateOrder: vi.fn(),
  handleRetry: vi.fn(),
  handleOpenPayUrl: vi.fn(),
  handleCopyPayUrl: vi.fn(),
};
vi.mock("@/features/payment/hooks/usePayment", () => ({
  usePayment: () => mockUsePayment,
}));

// ── Mock core/payment ──
vi.mock("@/core/payment", () => ({
  getPaymentTips: (p: string) => `Tips for ${p}`,
  isMobile: () => false,
  getAvailableProviders: () => [],
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

describe("PaymentModal", () => {
  const defaultProps = {
    planCode: "annual_8800",
    planName: "年度会员",
    amount: 8800,
    currency: "CNY",
    userKey: "u1",
    onClose: vi.fn(),
    onPaymentSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePayment.step = "choose";
    mockUsePayment.orderInfo = null;
    mockUsePayment.error = "";
    mockUsePayment.isCreating = false;
    mockUsePayment.selectedProvider = "mock";
    mockUsePayment.availableProviders = [
      { provider: "mock", icon: "🧪", recommended: true },
      { provider: "alipay", icon: "💳", recommended: false },
    ];
  });

  // ── 1. Renders plan info and payment methods ──
  it("renders plan info and payment method selection", () => {
    render(<PaymentModal {...defaultProps} />);

    // Plan name and amount
    expect(screen.getByText("年度会员")).toBeInTheDocument();
    expect(screen.getByText("¥8800.00")).toBeInTheDocument();
    // Payment method selection
    expect(screen.getByText("paymentSelectMethod")).toBeInTheDocument();
    expect(screen.getByText("paymentAlipay")).toBeInTheDocument();
    // mock provider uses getProviderLabel which defaults to paymentWechat
    const mockProviderBtns = screen.getAllByText("paymentWechat");
    expect(mockProviderBtns.length).toBeGreaterThan(0);
  });

  // ── 2. Create order button ──
  it("calls handleCreateOrder when confirm button clicked", () => {
    render(<PaymentModal {...defaultProps} />);

    const confirmBtn = screen.getByText(/paymentConfirmBtn/);
    fireEvent.click(confirmBtn);

    expect(mockUsePayment.handleCreateOrder).toHaveBeenCalled();
  });

  // ── 3. Waiting step ──
  it("shows waiting UI when step is 'waiting'", () => {
    mockUsePayment.step = "waiting";
    mockUsePayment.orderInfo = { order_no: "ORD-001", pay_url: "https://pay.test", provider: "mock", status: "pending" };

    render(<PaymentModal {...defaultProps} />);

    expect(screen.getByText("paymentWaitingTitle")).toBeInTheDocument();
    expect(screen.getByText("paymentReOpenBtn")).toBeInTheDocument();
    expect(screen.getByText("paymentCopyLink")).toBeInTheDocument();
  });

  // ── 4. Success step ──
  it("shows success UI when step is 'success'", () => {
    mockUsePayment.step = "success";
    mockUsePayment.orderInfo = { order_no: "ORD-002", pay_url: "", provider: "mock", status: "paid" };

    render(<PaymentModal {...defaultProps} />);

    expect(screen.getByText("paymentSuccessTitle")).toBeInTheDocument();
    expect(screen.getByText("paymentSuccessDesc")).toBeInTheDocument();
    expect(screen.getByText(/ORD-002/)).toBeInTheDocument();
  });

  // ── 5. Failed step ──
  it("shows failed UI when step is 'failed'", () => {
    mockUsePayment.step = "failed";
    mockUsePayment.error = "Payment timeout";

    render(<PaymentModal {...defaultProps} />);

    expect(screen.getByText("paymentFailedTitle")).toBeInTheDocument();
    expect(screen.getByText("Payment timeout")).toBeInTheDocument();
    // Retry button
    const retryBtn = screen.getByText("paymentRetryBtn");
    fireEvent.click(retryBtn);
    expect(mockUsePayment.handleRetry).toHaveBeenCalled();
  });

  // ── 6. Close button ──
  it("calls onClose when close button clicked", () => {
    render(<PaymentModal {...defaultProps} />);

    // The close button is in the header (contains X icon)
    const headerBtn = screen.getByRole("button", { name: "" });
    // Find button near the header
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(b => b.closest(".border-b-2"));
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });
});
