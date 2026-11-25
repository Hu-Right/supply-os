/**
 * 支付回跳对账：order_no/trade_no → 查单 → 解锁 → 打开公告 → 清理参数
 *
 * 旧 ?notice_id 分享深链已迁到独立详情路由（由列表页重定向），本 hook 只负责支付对账。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const getOrderStatusMock = vi.hoisted(() => vi.fn());
const grantMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock("@/core/i18n", () => ({ useLocale: () => ({ t: (k: string) => k, locale: "zh" }) }));
vi.mock("@/core/http", () => ({ clearApiCache: vi.fn() }));
vi.mock("@/core/payment/payment-facade", () => ({ getOrderStatus: getOrderStatusMock }));
vi.mock("@/features/procurement/api", () => ({ grantNoticeAccess: grantMock }));

import { usePaymentReturnReconciliation } from "@/features/procurement/hooks/usePaymentReturnReconciliation";
import { ORDER_STATUS } from "@/shared/constants/order-status";

function props(overrides: Record<string, unknown> = {}) {
  return {
    refreshMembership: vi.fn().mockResolvedValue(undefined),
    openNoticeById: vi.fn().mockResolvedValue(undefined),
    setActionMessage: vi.fn(),
    userId: 7,
    authReady: true,
    ...overrides,
  };
}

beforeEach(() => {
  nav.replace.mockClear();
  getOrderStatusMock.mockReset();
  grantMock.mockReset();
  window.history.replaceState({}, "", "/procurement/notice/123/detail");
});

describe("usePaymentReturnReconciliation — 支付回跳", () => {
  it("已支付：解锁并打开对应公告，随后清掉 order_no/trade_no", async () => {
    window.history.replaceState({}, "", "/procurement/notice/123/detail?order_no=O1&trade_no=T1");
    getOrderStatusMock.mockResolvedValue({ status: ORDER_STATUS.PAID, noticeId: 123 });
    const open = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => usePaymentReturnReconciliation(props({ openNoticeById: open, refreshMembership: refresh })));

    await waitFor(() => expect(open).toHaveBeenCalledWith(123));
    expect(grantMock).toHaveBeenCalledWith(123, "subscription", 0);
    expect(refresh).toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/procurement/notice/123/detail");
  });

  it("未决：只提示，不打开公告；参数照样清理", async () => {
    window.history.replaceState({}, "", "/procurement/notice/123/detail?order_no=O2");
    getOrderStatusMock.mockResolvedValue({ status: ORDER_STATUS.PENDING, noticeId: 123 });
    const open = vi.fn().mockResolvedValue(undefined);

    renderHook(() => usePaymentReturnReconciliation(props({ openNoticeById: open })));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/procurement/notice/123/detail"));
    expect(open).not.toHaveBeenCalled();
  });
});
