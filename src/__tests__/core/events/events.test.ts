import { describe, it, expect, vi } from "vitest";
import { emitAppEvent, onAppEvent } from "@/core/events";

describe("core/events", () => {
  it("delivers typed payload to subscriber", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:pay", handler);
    emitAppEvent("supply-os:pay", {
      code: "vip_month", name: "VIP", price: 99, currency: "CNY",
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ code: "vip_month", price: 99 }),
    );
    off();
  });

  it("unsubscribe stops delivery", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:crm-refresh", handler);
    off();
    emitAppEvent("supply-os:crm-refresh");
    expect(handler).not.toHaveBeenCalled();
  });

  it("stays interoperable with raw window.dispatchEvent", () => {
    const handler = vi.fn();
    const off = onAppEvent("supply-os:notice-paid", handler);
    window.dispatchEvent(new CustomEvent("supply-os:notice-paid", { detail: { noticeId: 7 } }));
    expect(handler).toHaveBeenCalledWith({ noticeId: 7 });
    off();
  });
});
