/**
 * E2E API 测试 — 支付接口
 * End-to-End API Tests: Payment Endpoints
 *
 * @description 测试支付相关 API 端点的权限和错误处理。
 *
 * 覆盖端点：
 *   - POST /api/payment/orders (需认证)
 *   - GET  /api/payment/orders (需认证)
 *   - GET  /api/payment/unlocks (需认证)
 *   - POST /api/billing/subscribe
 */
import { test, expect } from "@playwright/test";

test.describe("支付 API", () => {
  test("POST /api/payment/orders — 未认证返回 401", async ({ request }) => {
    const response = await request.post("/api/payment/orders", {
      data: {
        plan_code: "single_199",
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/payment/orders — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/payment/orders");

    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/payment/unlocks — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/payment/unlocks");

    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/billing/subscribe — 缺少参数返回错误", async ({ request }) => {
    const response = await request.post("/api/billing/subscribe", {
      data: {},
    });

    // 缺少必填字段应返回 400（无管理员密钥时返回 403）
    expect([400, 403, 422, 500]).toContain(response.status());
  });
});
