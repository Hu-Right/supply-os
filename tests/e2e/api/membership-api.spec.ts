/**
 * E2E API 测试 — 会员套餐接口
 * End-to-End API Tests: Membership Endpoints
 *
 * @description 测试会员套餐相关 API 端点。
 *
 * 覆盖端点：
 *   - GET /api/membership/plans
 *   - GET /api/membership/status (需认证)
 *   - GET /api/membership/upgrade/preview (需认证)
 */
import { test, expect } from "@playwright/test";

test.describe("会员套餐 API", () => {
  test("GET /api/membership/plans — 返回套餐列表", async ({ request }) => {
    const response = await request.get("/api/membership/plans");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回套餐数组
    expect(Array.isArray(body)).toBeTruthy();

    if (body.length > 0) {
      // 每个套餐应有 plan_code 和 price
      expect(body[0]).toHaveProperty("plan_code");
      expect(body[0]).toHaveProperty("price");
    }
  });

  test("GET /api/membership/status — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/membership/status");

    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/membership/upgrade/preview — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/membership/upgrade/preview");

    expect([401, 403]).toContain(response.status());
  });
});
