import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchOrders, fetchUnlocks } from "@/features/payment/api";
import { server } from "@/__tests__/mocks/server";

describe("Payment history API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchOrders sends user_key and paging params and returns paged result", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/payment/orders", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          total: 1,
          page: 2,
          limit: 10,
          list: [
            {
              order_no: "ORD-1",
              user_key: "uk_test",
              provider: "mock",
              plan_code: "annual_manual_8800",
              amount: 8800,
              currency: "CNY",
              status: "paid",
            },
          ],
        });
      })
    );

    const result = await fetchOrders({ userKey: "uk_test", page: 2, limit: 10 });

    expect(capturedUrl).toContain("user_key=uk_test");
    expect(capturedUrl).toContain("page=2");
    expect(capturedUrl).toContain("limit=10");
    expect(result.total).toBe(1);
    expect(result.list[0].order_no).toBe("ORD-1");
  });

  it("fetchOrders forwards optional status filter", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/payment/orders", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ total: 0, page: 1, limit: 10, list: [] });
      })
    );

    await fetchOrders({ userKey: "uk_test", status: "paid" });
    expect(capturedUrl).toContain("status=paid");
  });

  it("fetchOrders throws on failure", async () => {
    server.use(
      http.get("/api/payment/orders", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );
    await expect(fetchOrders({ userKey: "uk_test" })).rejects.toThrow();
  });

  it("fetchUnlocks returns paged unlock records", async () => {
    server.use(
      http.get("/api/payment/unlocks", () =>
        HttpResponse.json({
          total: 1,
          page: 1,
          limit: 10,
          list: [
            {
              user_key: "uk_test",
              notice_id: 42,
              unlock_type: "subscription",
              price: 0,
            },
          ],
        })
      )
    );

    const result = await fetchUnlocks({ userKey: "uk_test" });
    expect(result.list[0].notice_id).toBe(42);
    expect(result.list[0].unlock_type).toBe("subscription");
  });

  it("fetchUnlocks throws on failure", async () => {
    server.use(
      http.get("/api/payment/unlocks", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );
    await expect(fetchUnlocks({ userKey: "uk_test" })).rejects.toThrow();
  });
});
