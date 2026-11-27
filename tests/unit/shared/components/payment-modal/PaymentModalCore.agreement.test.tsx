/**
 * 统一支付弹窗 — 购买前协议勾选（P0 合规）
 *
 * 钉住四件产品事实：
 * 1) 协议勾选默认关闭，确认支付按钮在未勾选时不可提交；
 * 2) 必须由用户主动勾选后才可建单（点协议链接不算勾选）；
 * 3) 业务条件（canSubmit）与协议勾选是「与」关系，任一不满足都不能提交；
 * 4) 协议链接指向 /terms /refund-policy /privacy，新标签页打开。
 *
 * @module shared/components/payment-modal/PaymentModalCore.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ── Mock 依赖 ────────────────────────────────────────────────────────────────

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/core/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/payment")>();
  return {
    ...actual,
    fetchPaymentConfigStatus: vi.fn().mockResolvedValue({ alipay: true, wechat: true }),
    getAvailableProviders: () => [{ provider: "alipay", icon: "A", recommended: true }],
    detectPlatformEnv: () => "pc",
  };
});

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    [key: string]: unknown;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/shared/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectableCard: ({
    children,
    selected,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    selected: boolean;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button type="button" disabled={disabled} data-selected={String(selected)} onClick={onClick}>
      {children}
    </button>
  ),
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
}));

import PaymentModalCore from "@/shared/components/PaymentModalCore";

function renderModal(props: { canSubmit?: boolean } = {}) {
  const onCreateOrder = vi.fn().mockResolvedValue({
    orderNo: "SO20261127A0001",
    provider: "alipay",
    qrCodeUrl: null,
    payUrl: null,
  });
  const view = render(
    <PaymentModalCore
      onClose={vi.fn()}
      title="paymentTitle"
      amount={100}
      currency="CNY"
      canSubmit={props.canSubmit}
      onCreateOrder={onCreateOrder}
      onQueryStatus={vi.fn().mockResolvedValue({ status: "pending" })}
      summaryNode={<div>Plan Summary</div>}
    />
  );
  return { ...view, onCreateOrder };
}

const confirmButton = () => screen.getByRole("button", { name: /paymentConfirmBtn/ });

describe("PaymentModalCore 购买前协议勾选", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("默认不勾选，确认支付按钮禁用", async () => {
    renderModal();
    // 等支付通道配置的 effect 落定，避免测试结束后异步 setState
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText("paymentAgreementHint")).toBeInTheDocument();
  });

  it("用户主动勾选后才可建单，勾选后提示消失", async () => {
    const { onCreateOrder } = renderModal();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByText("paymentAgreementHint")).not.toBeInTheDocument();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onCreateOrder).toHaveBeenCalledWith("alipay"));
  });

  it("未勾选时点击确认按钮不会创建订单", async () => {
    const { onCreateOrder } = renderModal();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(confirmButton());
    expect(onCreateOrder).not.toHaveBeenCalled();
  });

  it("点击协议链接只打开文档，不会替用户勾选", async () => {
    renderModal();
    await act(async () => {
      await Promise.resolve();
    });

    const termsLink = screen.getByRole("link", { name: "paymentAgreementTerms" });
    expect(termsLink).toHaveAttribute("href", "/terms");
    expect(termsLink).toHaveAttribute("target", "_blank");
    expect(termsLink).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(termsLink);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();

    expect(screen.getByRole("link", { name: "paymentAgreementRefund" })).toHaveAttribute(
      "href",
      "/refund-policy"
    );
    expect(screen.getByRole("link", { name: "paymentAgreementPrivacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });

  it("业务条件不满足时，即使已勾选协议也不能提交", async () => {
    const { onCreateOrder } = renderModal({ canSubmit: false });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    expect(onCreateOrder).not.toHaveBeenCalled();
  });
});
