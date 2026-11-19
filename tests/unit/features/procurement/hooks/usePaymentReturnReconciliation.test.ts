/**
 * 分享/深链到达 → 登录/注册 → 打开详情
 *
 * 回归背景（2026-11-19）：未登录时先把 arrivalResolvedRef 置位，登录是 SPA 内状态更新
 * （不整页刷新），登录成功后 effect 重跑却被 ref 拦住 → 用户停在列表页，分享的公告丢失。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock("@/core/i18n", () => ({ useLocale: () => ({ t: (k: string) => k, locale: "zh" }) }));
vi.mock("@/core/http", () => ({ clearApiCache: vi.fn() }));
vi.mock("@/core/payment/payment-facade", () => ({ getOrderStatus: vi.fn() }));
vi.mock("@/features/procurement/api", () => ({ grantNoticeAccess: vi.fn() }));

import { usePaymentReturnReconciliation } from "@/features/procurement/hooks/usePaymentReturnReconciliation";

interface Options {
  refreshMembership: () => Promise<void>;
  openNoticeById: (id: number) => Promise<void>;
  setActionMessage: (m: string) => void;
  onRequireLogin: () => void;
  userId?: number;
  authReady?: boolean;
}

function makeProps(overrides: Partial<Options> = {}): Options {
  return {
    refreshMembership: vi.fn().mockResolvedValue(undefined),
    openNoticeById: vi.fn().mockResolvedValue(undefined),
    setActionMessage: vi.fn(),
    onRequireLogin: vi.fn(),
    userId: undefined,
    authReady: true,
    ...overrides,
  };
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockClear();
});

describe("usePaymentReturnReconciliation — 分享深链跨登录", () => {
  it("未登录只弹一次登录、不消费到达机会；登录后自动打开分享的公告", async () => {
    nav.search = "notice_id=123";
    const open = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn();

    const { rerender } = renderHook((props: Options) => usePaymentReturnReconciliation(props), {
      initialProps: makeProps({ openNoticeById: open, onRequireLogin: prompt }),
    });

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();

    // 登录成功：SPA 内 userId 由 undefined → 7，不刷新页面
    rerender(makeProps({ openNoticeById: open, onRequireLogin: prompt, userId: 7 }));

    await waitFor(() => expect(open).toHaveBeenCalledWith(123));
    // 到达机会只消费一次，后续重渲染不重复打开
    rerender(makeProps({ openNoticeById: open, onRequireLogin: prompt, userId: 7 }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("已登录直达：不弹登录，直接打开", async () => {
    nav.search = "notice_id=456";
    const open = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn();

    renderHook((props: Options) => usePaymentReturnReconciliation(props), {
      initialProps: makeProps({ openNoticeById: open, onRequireLogin: prompt, userId: 9 }),
    });

    await waitFor(() => expect(open).toHaveBeenCalledWith(456));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("auth 未就绪时不空开也不误弹；就绪后未登录弹一次，注册成功照样打开", async () => {
    nav.search = "notice_id=789";
    const open = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn();

    const { rerender } = renderHook((props: Options) => usePaymentReturnReconciliation(props), {
      initialProps: makeProps({ openNoticeById: open, onRequireLogin: prompt, authReady: false }),
    });

    expect(prompt).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    rerender(makeProps({ openNoticeById: open, onRequireLogin: prompt, authReady: true }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();

    // 注册成功 = 直接拿到登录态（注册即登录）
    rerender(makeProps({ openNoticeById: open, onRequireLogin: prompt, userId: 11 }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(789));
  });
});
