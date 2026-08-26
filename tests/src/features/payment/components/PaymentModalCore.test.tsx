/**
 * PaymentModalCore 组件测试
 * P0 — 支付弹窗核心状态机：choose → waiting → success / failed
 *
 * 三维评估：逻辑 ✅ | 业务 ✅ | 频改 ✅ → 必须测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import PaymentModalCore from "@/features/payment/components/PaymentModalCore";

vi.mock("@/core/payment", () => ({
  fetchPaymentConfigStatus: vi.fn().mockResolvedValue({ alipay: true, wechat: true }),
  getAvailableProviders: vi.fn().mockReturnValue([
    { provider: "alipay" as const, label: "Alipay" },
    { provider: "wechat" as const, label: "WeChat" },
  ]),
  detectPlatformEnv: vi.fn().mockReturnValue("desktop"),
  mapPaymentError: vi.fn((err: any) => err?.message || "payment failed"),
}));

vi.mock("@/shared/ui", () => ({
  Modal: ({ children, onClose }: any) => (
    <div role="dialog" data-testid="modal">
      <button onClick={onClose} data-testid="close-modal">close</button>
      {children}
    </div>
  ),
}));

const defaultProps = {
  onClose: vi.fn(),
  title: "Test Payment",
  amount: 99,
  currency: "CNY",
  summaryNode: <div>Summary</div>,
  onCreateOrder: vi.fn().mockResolvedValue({ order_no: "ORD-001", provider: "alipay", qr_code: "data:image/png;base64,xxx" }),
  onQueryStatus: vi.fn().mockResolvedValue({ status: "pending" }),
  onSuccess: vi.fn(),
};

describe("PaymentModalCore", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("渲染弹窗内容", async () => {
    await act(async () => { render(<PaymentModalCore {...defaultProps} />); });
    // 支付方式选择区域
    expect(screen.getByText("paymentSelectMethod")).toBeTruthy();
    expect(screen.getByText("paymentAlipay")).toBeTruthy();
  });

  it("初始步骤为 choose — 显示摘要", async () => {
    await act(async () => { render(<PaymentModalCore {...defaultProps} />); });
    expect(screen.getByText("Summary")).toBeTruthy();
  });

  it("点击确认 → 调用 onCreateOrder", async () => {
    await act(async () => { render(<PaymentModalCore {...defaultProps} />); });
    const confirmBtn = screen.getByRole("button", { name: /99/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(defaultProps.onCreateOrder).toHaveBeenCalledWith("alipay");
    });
  });

  it("onCreateOrder 失败 → 显示错误信息", async () => {
    const failProps = { ...defaultProps, onCreateOrder: vi.fn().mockRejectedValue(new Error("PAYMENT_PROVIDER_UNAVAILABLE")) };
    await act(async () => { render(<PaymentModalCore {...failProps} />); });
    fireEvent.click(screen.getByRole("button", { name: /99/i }));
    await waitFor(() => {
      expect(screen.getByText("PAYMENT_PROVIDER_UNAVAILABLE")).toBeTruthy();
    });
  });

  it("canSubmit=false 时确认按钮不可点击", async () => {
    await act(async () => { render(<PaymentModalCore {...defaultProps} canSubmit={false} />); });
    expect(screen.getByRole("button", { name: /99/i })).toHaveProperty("disabled", true);
  });

  it("关闭弹窗 → 调用 onClose", async () => {
    await act(async () => { render(<PaymentModalCore {...defaultProps} />); });
    fireEvent.click(screen.getByTestId("close-modal"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
