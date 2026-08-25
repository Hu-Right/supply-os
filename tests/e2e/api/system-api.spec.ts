/**
 * E2E API 测试 — 系统接口
 * End-to-End API Tests: System Endpoints
 *
 * @description 测试系统相关 API 端点（公开接口，无需认证）。
 *
 * 覆盖端点：
 *   - GET /api/system/icp
 *   - GET /api/system/links
 *   - GET /api/system/version
 */
import { test, expect } from "@playwright/test";

test.describe("系统 API", () => {
  test("GET /api/system/icp — 返回 ICP 备案信息", async ({ request }) => {
    const response = await request.get("/api/system/icp");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回 ICP 信息对象或字符串
    expect(body).toBeTruthy();
  });

  test("GET /api/system/links — 返回外部链接列表", async ({ request }) => {
    const response = await request.get("/api/system/links");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回链接数组或对象
    expect(body).toBeTruthy();
    expect(
      Array.isArray(body) ||
      typeof body === "object"
    ).toBeTruthy();
  });

  test("GET /api/system/version — 返回版本号", async ({ request }) => {
    const response = await request.get("/api/system/version");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回版本号字符串或包含 version 字段的对象
    if (typeof body === "string") {
      expect(body.length).toBeGreaterThan(0);
    } else {
      expect(body).toHaveProperty("version");
    }
  });
});
