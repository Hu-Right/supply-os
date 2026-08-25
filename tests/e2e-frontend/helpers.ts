/**
 * E2E 前端测试 — API Mock 辅助函数
 * API Mock Helpers for Frontend-only E2E Tests
 *
 * @description 提供常用的 API mock 函数，供前端 E2E 测试使用。
 *              使用 Playwright 的 page.route() 拦截 API 请求并返回 mock 数据。
 */
import type { Page } from "@playwright/test";

/**
 * Mock 所有常见 API 请求为空响应（防止未处理的请求报错）
 */
export async function mockEmptyApis(page: Page) {
  // Mock 会员套餐 API
  await page.route("**/api/membership/plans", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  // Mock 解锁历史 API
  await page.route("**/api/payment/unlocks", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  // Mock 用户信息 API
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    })
  );

  // Mock 系统版本 API
  await page.route("**/api/system/version", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "0.0.0-test" }),
    })
  );
}

/**
 * Mock 会员套餐 API 返回测试数据
 */
export async function mockMembershipPlans(page: Page) {
  await page.route("**/api/membership/plans", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          plan_code: "free",
          name: "免费体验",
          price: 0,
          currency: "CNY",
          description: "基础体验功能",
          features: ["基础搜索", "每日 3 次查看"],
          sort_order: 0,
        },
        {
          plan_code: "pro",
          name: "专业版",
          price: 299,
          currency: "CNY",
          description: "专业采购工具",
          features: ["无限搜索", "每日 50 次查看", "高级筛选"],
          sort_order: 1,
        },
        {
          plan_code: "enterprise",
          name: "企业版",
          price: 999,
          currency: "CNY",
          description: "企业级解决方案",
          features: ["全部功能", "无限查看", "专属客服"],
          sort_order: 2,
        },
      ]),
    })
  );
}

/**
 * Mock 登录 API 返回成功
 */
export async function mockLoginSuccess(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "mock-jwt-token",
        user: { id: 1, email: "test@example.com", display_name: "测试用户" },
      }),
    })
  );

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "test@example.com",
        display_name: "测试用户",
      }),
    })
  );
}

/**
 * Mock 登录 API 返回失败
 */
export async function mockLoginFailed(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "邮箱或密码错误" }),
    })
  );
}
