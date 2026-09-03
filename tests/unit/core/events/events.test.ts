import { describe, it, expect, vi } from "vitest";
import { emitAppEvent, onAppEvent } from "@/core/events/events";

describe("emitAppEvent / onAppEvent", () => {
  it("emit → on 接收无载荷事件", () => {
    const handler = vi.fn();
    const unsub = onAppEvent("supply-os:require-login", handler);
    emitAppEvent("supply-os:require-login");
    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });

  it("emit → on 接收带载荷事件", () => {
    const handler = vi.fn();
    const unsub = onAppEvent("supply-os:unauthorized", handler);
    emitAppEvent("supply-os:unauthorized", { endpoint: "/api/test" });
    expect(handler).toHaveBeenCalledWith({ endpoint: "/api/test" });
    unsub();
  });

  it("支付事件 → 传递完整 PayEventDetail", () => {
    const handler = vi.fn();
    const unsub = onAppEvent("supply-os:pay", handler);
    const detail = {
      code: "annual_799",
      name: "标讯个人会员",
      price: 799,
      currency: "CNY",
      noticeId: null,
    };
    emitAppEvent("supply-os:pay", detail);
    expect(handler).toHaveBeenCalledWith(detail);
    unsub();
  });

  it("unsubscribe 后不再接收事件", () => {
    const handler = vi.fn();
    const unsub = onAppEvent("supply-os:require-vip", handler);
    unsub();
    emitAppEvent("supply-os:require-vip");
    expect(handler).not.toHaveBeenCalled();
  });

  it("多个订阅者独立接收", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onAppEvent("supply-os:consult", handler1);
    const unsub2 = onAppEvent("supply-os:consult", handler2);
    emitAppEvent("supply-os:consult");
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    unsub1();
    unsub2();
  });

  it("不同事件互不干扰", () => {
    const loginHandler = vi.fn();
    const vipHandler = vi.fn();
    const unsub1 = onAppEvent("supply-os:require-login", loginHandler);
    const unsub2 = onAppEvent("supply-os:require-vip", vipHandler);
    emitAppEvent("supply-os:require-login");
    expect(loginHandler).toHaveBeenCalledOnce();
    expect(vipHandler).not.toHaveBeenCalled();
    unsub1();
    unsub2();
  });
});
