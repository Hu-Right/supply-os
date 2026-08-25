/**
 * E2E API 测试 — 供应商接口
 * End-to-End API Tests: Supplier Endpoints
 *
 * @description 测试供应商相关 API 端点。
 *
 * 覆盖端点：
 *   - GET /api/suppliers (公开)
 *   - POST /api/leads (需认证)
 */
import { test, expect } from "@playwright/test";

test.describe("供应商 API", () => {
  test("GET /api/suppliers — 返回供应商列表", async ({ request }) => {
    const response = await request.get("/api/suppliers");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回供应商数组或分页结构
    expect(body).toBeTruthy();
    expect(
      Array.isArray(body) ||
      typeof body === "object"
    ).toBeTruthy();

    // 如果是分页结构，应有 list 或 items 字段
    if (!Array.isArray(body) && body.list) {
      expect(Array.isArray(body.list)).toBeTruthy();
    }
  });

  test("POST /api/leads — 未认证返回 401", async ({ request }) => {
    const response = await request.post("/api/leads", {
      data: {
        type: "exhibition_register",
        companyName: "测试公司",
      },
    });

    // leads 创建需要认证
    expect([401, 403]).toContain(response.status());
  });
});
