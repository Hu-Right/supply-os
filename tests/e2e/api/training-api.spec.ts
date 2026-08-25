/**
 * E2E API 测试 — 培训接口
 * End-to-End API Tests: Training Endpoints
 *
 * @description 测试培训相关 API 端点。
 *
 * 覆盖端点：
 *   - POST /api/training/register
 *   - GET  /api/training/landing
 *   - GET  /api/training/downloads/stats
 *   - POST /api/training/downloads/track
 *   - POST /api/training/orders (需认证)
 *   - GET  /api/training/orders/:order_no (需认证)
 */
import { test, expect } from "@playwright/test";

test.describe("培训 API", () => {
  test("GET /api/training/landing — 返回课程数据", async ({ request }) => {
    const response = await request.get("/api/training/landing");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回课程信息对象
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });

  test("GET /api/training/downloads/stats — 返回下载统计", async ({ request }) => {
    const response = await request.get("/api/training/downloads/stats");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回统计对象
    expect(typeof body).toBe("object");
  });

  test("POST /api/training/register — 缺少必填字段返回错误", async ({ request }) => {
    const response = await request.post("/api/training/register", {
      data: {},
    });

    // 缺少必填字段
    expect([400, 422]).toContain(response.status());
  });

  test("POST /api/training/downloads/track — 缺少参数返回错误", async ({ request }) => {
    const response = await request.post("/api/training/downloads/track", {
      data: {},
    });

    expect([400, 422, 500]).toContain(response.status());
  });

  test("POST /api/training/orders — 未认证返回 401", async ({ request }) => {
    const response = await request.post("/api/training/orders", {
      data: {
        course_id: 1,
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/training/orders/:order_no — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/training/orders/ORD-TEST-001");

    expect([401, 403, 404]).toContain(response.status());
  });
});
