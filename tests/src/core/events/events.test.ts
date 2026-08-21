/**
 * src/core/events/events.ts 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitAppEvent, onAppEvent } from "../../../../src/core/events/events";

describe("emitAppEvent / onAppEvent", () => {
  beforeEach(() => {
    // 确保每次测试前清理所有监听器
  });

  it("派发事件可被订阅者接收", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:require-login", handler);

    emitAppEvent("supply-os:require-login");

    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("带载荷事件正确传递", () => {
    const handler = vi.fn();
    const detail = {
      code: "annual_799",
      name: "个人版",
      price: 799,
      currency: "CNY",
    };
    const off = onAppEvent("supply-os:pay", handler);

    emitAppEvent("supply-os:pay", detail);

    expect(handler).toHaveBeenCalledWith(detail);
    off();
  });

  it("解绑函数正确移除监听", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:require-vip", handler);

    emitAppEvent("supply-os:require-vip");
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    emitAppEvent("supply-os:require-vip");
    expect(handler).toHaveBeenCalledTimes(1); // 不再触发
  });

  it("多个订阅者独立接收", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off1 = onAppEvent("supply-os:crm-refresh", h1);
    const off2 = onAppEvent("supply-os:crm-refresh", h2);

    emitAppEvent("supply-os:crm-refresh");

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    off1();
    off2();
  });

  it("带 endpoint 载荷的事件", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:unauthorized", handler);

    emitAppEvent("supply-os:unauthorized", { endpoint: "/api/test" });

    expect(handler).toHaveBeenCalledWith({ endpoint: "/api/test" });
    off();
  });
});
