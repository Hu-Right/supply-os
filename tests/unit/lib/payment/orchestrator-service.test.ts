import { describe, it, expect, vi } from "vitest";
import { getOrderBusiness, ORDER_PREFIX } from "@/lib/payment/orchestrator";

vi.mock("server-only", () => ({}));

describe("getOrderBusiness — 服务订单前缀", () => {
  it("SV 前缀 → service", () => {
    expect(ORDER_PREFIX.SERVICE).toBe("SV");
    expect(getOrderBusiness("SV20260923A1B2C3")).toBe("service");
  });
  it("不误判其他前缀", () => {
    expect(getOrderBusiness("LE20260923ABC")).toBe("learning");
    expect(getOrderBusiness("SO20260923ABC")).toBe("membership");
    expect(getOrderBusiness("TR20260923ABC")).toBe("training");
  });
});
