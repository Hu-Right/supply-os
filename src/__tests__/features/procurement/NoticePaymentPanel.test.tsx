import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoticePaymentPanel } from "@/features/procurement/components/NoticePaymentPanel";
import type { MembershipPlan } from "@/features/procurement/types";
import type { OrderInfo } from "@/features/payment/api";

// ── Mock useLocale（key 透传） ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const plans: MembershipPlan[] = [
  {
    plan_code: "single_89",
    name: "Single Unlock",
    description: "One-off unlock",
    price: 89,
    currency: "CNY",
    unlock_quota: 1,
    free_quota: 0,
    plan_type: "single",
  },
  {
    plan_code: "week_card",
    name: "Week Card",
    description: "Weekly quota",
    price: 199,
    currency: "CNY",
    unlock_quota: 10,
    free_quota: 0,
    plan_type: "subscription",
  },
];

const baseProps = {
  plans,
  provider: "alipay" as const,
  order: null as OrderInfo | null,
  busyPlanCode: "",
  message: "",
  onProviderChange: vi.fn(),
  onCreateOrder: vi.fn(),
  onMockPaid: vi.fn(),
  onClose: vi.fn(),
};

describe("NoticePaymentPanel", () => {
  it("renders products header and each plan with formatted price", () => {
    render(<NoticePaymentPanel {...baseProps} />);
    expect(screen.getByText("procurement_products")).toBeInTheDocument();
    expect(screen.getByText("Single Unlock")).toBeInTheDocument();
    expect(screen.getByText("Week Card")).toBeInTheDocument();
    expect(screen.getByText("¥89")).toBeInTheDocument();
    expect(screen.getByText("¥199")).toBeInTheDocument();
  });

  it("disables the WeChat provider button while Alipay stays enabled", () => {
    render(<NoticePaymentPanel {...baseProps} />);
    const alipayBtn = screen.getByText("procurement_alipay");
    const wechatBtn = screen.getByText("procurement_wechatprocurement_wechatDisabled");
    expect(alipayBtn).not.toBeDisabled();
    expect(wechatBtn).toBeDisabled();
  });

  it("triggers onCreateOrder with the plan code when a plan buy button is clicked", () => {
    render(<NoticePaymentPanel {...baseProps} />);
    const buyButtons = screen.getAllByText("procurement_choosePay");
    fireEvent.click(buyButtons[0]);
    expect(baseProps.onCreateOrder).toHaveBeenCalledWith("single_89");
  });

  it("triggers onClose when the close button is clicked", () => {
    render(<NoticePaymentPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText("procurement_close"));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("shows the mock-paid button for a mock order and triggers onMockPaid", () => {
    const order: OrderInfo = {
      order_no: "PO-MOCK-1",
      provider: "mock",
      plan_code: "single_89",
      amount: 89,
      currency: "CNY",
      status: "pending",
      payment_mode: "mock",
      pay_url: "",
    };
    render(<NoticePaymentPanel {...baseProps} order={order} />);
    expect(screen.getByText(/PO-MOCK-1/)).toBeInTheDocument();
    const mockPaidBtn = screen.getByText("procurement_mockPaid");
    fireEvent.click(mockPaidBtn);
    expect(baseProps.onMockPaid).toHaveBeenCalled();
  });

  it("shows a real payment button for a configured order with pay_url", () => {
    const order: OrderInfo = {
      order_no: "PO-REAL-1",
      provider: "alipay",
      plan_code: "single_89",
      amount: 89,
      currency: "CNY",
      status: "pending",
      payment_mode: "configured",
      pay_url: "https://pay.example.com/checkout",
    };
    render(<NoticePaymentPanel {...baseProps} order={order} />);
    expect(screen.getByText(/PO-REAL-1/)).toBeInTheDocument();
    // configured 订单不显示 mock 确认按钮
    expect(screen.queryByText("procurement_mockPaid")).not.toBeInTheDocument();
    expect(screen.getByText("procurement_orderCreated")).toBeInTheDocument();
  });
});
