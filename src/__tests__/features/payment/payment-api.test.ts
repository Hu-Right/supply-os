import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { createOrder, getOrderStatus } from "@/features/payment/api";
import { server } from "@/__tests__/mocks/server";

describe("Payment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createOrder sends POST request and returns order info", async () => {
    server.use(
      http.post("/api/payment/orders", () =>
        HttpResponse.json({
          order_no: "ORD-001",
          pay_url: "https://pay.example.com",
          provider: "mock",
          status: "pending",
        })
      )
    );

    const result = await createOrder({
      userKey: "uk_test",
      planCode: "pro_monthly",
      provider: "mock",
    });

    expect(result.order_no).toBe("ORD-001");
    expect(result.status).toBe("pending");
  });

  it("createOrder throws on failure", async () => {
    server.use(
      http.post("/api/payment/orders", () =>
        HttpResponse.json({ error: "Invalid plan" }, { status: 400 })
      )
    );

    await expect(
      createOrder({ userKey: "uk_test", planCode: "invalid", provider: "mock" })
    ).rejects.toThrow();
  });

  it("getOrderStatus sends GET request and returns status", async () => {
    server.use(
      http.get("/api/payment/orders/:orderId", () =>
        HttpResponse.json({
          order_no: "ORD-001",
          status: "paid",
          provider: "mock",
          pay_url: "",
        })
      )
    );

    const result = await getOrderStatus("ORD-001");
    expect(result.status).toBe("paid");
  });

  it("getOrderStatus throws on failure", async () => {
    server.use(
      http.get("/api/payment/orders/:orderId", () =>
        HttpResponse.json({ error: "Not found" }, { status: 404 })
      )
    );

    await expect(getOrderStatus("INVALID")).rejects.toThrow();
  });
});
