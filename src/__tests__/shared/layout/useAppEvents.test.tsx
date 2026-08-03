import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppEvents } from "@/shared/layout/useAppEvents";

function makeHandlers() {
  return {
    onRequireLogin: vi.fn(),
    onConsult: vi.fn(),
    onPay: vi.fn(),
  };
}

describe("useAppEvents", () => {
  it("routes require-login / unauthorized / require-vip / open-account to onRequireLogin", () => {
    const handlers = makeHandlers();
    renderHook(() => useAppEvents(handlers));

    for (const evt of [
      "supply-os:require-login",
      "supply-os:unauthorized",
      "supply-os:require-vip",
      "supply-os:open-account",
    ]) {
      window.dispatchEvent(new CustomEvent(evt));
    }
    expect(handlers.onRequireLogin).toHaveBeenCalledTimes(4);
    expect(handlers.onConsult).not.toHaveBeenCalled();
  });

  it("routes consult event to onConsult", () => {
    const handlers = makeHandlers();
    renderHook(() => useAppEvents(handlers));
    window.dispatchEvent(new CustomEvent("supply-os:consult"));
    expect(handlers.onConsult).toHaveBeenCalledTimes(1);
  });

  it("routes pay event detail to onPay and ignores missing detail", () => {
    const handlers = makeHandlers();
    renderHook(() => useAppEvents(handlers));

    const detail = { code: "week_21", name: "三周体验", price: 299, currency: "CNY" };
    window.dispatchEvent(new CustomEvent("supply-os:pay", { detail }));
    expect(handlers.onPay).toHaveBeenCalledWith(detail);

    // 无 detail 的 pay 事件不触发回调
    window.dispatchEvent(new CustomEvent("supply-os:pay"));
    expect(handlers.onPay).toHaveBeenCalledTimes(1);
  });

  it("removes all listeners on unmount", () => {
    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useAppEvents(handlers));
    unmount();

    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
    window.dispatchEvent(new CustomEvent("supply-os:consult"));
    window.dispatchEvent(
      new CustomEvent("supply-os:pay", { detail: { code: "x", name: "x", price: 1, currency: "CNY" } })
    );
    expect(handlers.onRequireLogin).not.toHaveBeenCalled();
    expect(handlers.onConsult).not.toHaveBeenCalled();
    expect(handlers.onPay).not.toHaveBeenCalled();
  });

  it("rebinds listeners when handlers identity changes", () => {
    const first = makeHandlers();
    const second = makeHandlers();
    let current = first;
    const { rerender } = renderHook(() => useAppEvents(current));

    act(() => {
      current = second;
    });
    rerender();

    window.dispatchEvent(new CustomEvent("supply-os:consult"));
    expect(first.onConsult).not.toHaveBeenCalled();
    expect(second.onConsult).toHaveBeenCalledTimes(1);
  });
});
