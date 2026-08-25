/**
 * E2E API 测试 — 公告搜索接口
 * End-to-End API Tests: Notice Search Endpoints
 *
 * @description 测试公告搜索相关 API 端点的响应格式。
 *
 * 覆盖端点：
 *   - GET /api/notices/unified-search
 *   - GET /api/notices/countries
 *   - GET /api/notices/agencies
 *   - GET /api/notices/stats
 */
import { test, expect } from "@playwright/test";

test.describe("公告搜索 API", () => {
  test("GET /api/notices/unified-search — 无参数返回结果", async ({ request }) => {
    const response = await request.get("/api/notices/unified-search");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回数组或分页结构
    expect(body).toBeTruthy();
    expect(
      Array.isArray(body) ||
      typeof body === "object"
    ).toBeTruthy();
  });

  test("GET /api/notices/unified-search — 带关键词搜索", async ({ request }) => {
    const response = await request.get("/api/notices/unified-search", {
      params: { q: "water" },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 结果应为数组或包含 items 字段
    const items = Array.isArray(body) ? body : body.items || body.results || [];
    expect(Array.isArray(items)).toBeTruthy();
  });

  test("GET /api/notices/countries — 返回国家列表", async ({ request }) => {
    const response = await request.get("/api/notices/countries");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回国家列表数组
    expect(Array.isArray(body)).toBeTruthy();

    if (body.length > 0) {
      // 每个国家应有 name 或 code 字段
      expect(body[0]).toHaveProperty("name");
    }
  });

  test("GET /api/notices/agencies — 返回机构列表", async ({ request }) => {
    const response = await request.get("/api/notices/agencies");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回机构列表数组
    expect(Array.isArray(body)).toBeTruthy();

    if (body.length > 0) {
      // 每个机构应有 name 字段
      expect(body[0]).toHaveProperty("name");
    }
  });

  test("GET /api/notices/stats — 返回统计信息", async ({ request }) => {
    const response = await request.get("/api/notices/stats");

    expect(response.status()).toBe(200);

    const body = await response.json();
    // 应返回统计对象
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });
});
