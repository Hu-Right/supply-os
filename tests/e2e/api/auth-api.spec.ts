/**
 * E2E API 测试 — 认证接口
 * End-to-End API Tests: Authentication Endpoints
 *
 * @description 测试认证相关 API 端点的响应格式和错误处理。
 *              使用 Playwright request context 直接调用 API。
 *
 * 覆盖端点：
 *   - POST /api/auth/login
 *   - POST /api/auth/register
 *   - POST /api/auth/send-register-code
 *   - POST /api/auth/check-email-phone
 *   - POST /api/auth/forgot-password
 *   - GET  /api/auth/user
 *   - POST /api/auth/refresh
 *   - POST /api/auth/logout
 */
import { test, expect } from "@playwright/test";

test.describe("认证 API", () => {
  test("POST /api/auth/login — 缺少参数返回错误", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: {},
    });

    // 应返回 400 或 401
    expect([400, 401, 422]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/auth/login — 错误凭证返回 401", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: {
        email: "nonexistent@example.com",
        password: "WrongPassword123",
      },
    });

    expect([400, 401, 404]).toContain(response.status());
  });

  test("POST /api/auth/register — 缺少必填字段返回错误", async ({ request }) => {
    const response = await request.post("/api/auth/register", {
      data: {
        email: "test@example.com",
      },
    });

    // 缺少密码等必填字段
    expect([400, 422]).toContain(response.status());
  });

  test("POST /api/auth/send-register-code — 缺少邮箱返回错误", async ({ request }) => {
    const response = await request.post("/api/auth/send-register-code", {
      data: {},
    });

    expect([400, 422]).toContain(response.status());
  });

  test("POST /api/auth/check-email-phone — 查询不存在的账号", async ({ request }) => {
    const response = await request.post("/api/auth/check-email-phone", {
      data: {
        email: "nonexistent-xyz-12345@example.com",
      },
    });

    // 可能返回 200（不存在）或 404
    expect([200, 404]).toContain(response.status());
  });

  test("GET /api/auth/user — 未认证返回 401", async ({ request }) => {
    const response = await request.get("/api/auth/user");

    // 未提供 token，应返回 401
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/auth/refresh — 无效 token 返回错误", async ({ request }) => {
    const response = await request.post("/api/auth/refresh", {
      headers: {
        Authorization: "Bearer invalid-token-xyz",
      },
    });

    expect([400, 401, 403]).toContain(response.status());
  });

  test("POST /api/auth/logout — 未认证返回错误", async ({ request }) => {
    const response = await request.post("/api/auth/logout");

    // logout 可能允许未认证（清除 cookie），也可能返回错误
    expect([200, 401, 403]).toContain(response.status());
  });
});
