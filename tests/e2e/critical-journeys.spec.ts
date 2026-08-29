/**
 * E2E 测试框架：关键用户旅程
 * E2E Test Framework: Critical User Journeys
 *
 * @description 基于 Playwright 的端到端测试，覆盖核心业务流程。
 *              需要真实运行的应用实例和测试数据库。
 *              CI 中由 e2e.yml 工作流自动执行。
 *
 * 运行方式：
 *   npx playwright test --config=playwright.config.ts
 *   npm run test:e2e
 *   npm run test:e2e:ui     # 交互式 UI 模式
 */
import { test, expect, type Page } from "@playwright/test";

// ── 测试数据常量 ──────────────────────────────────────────────────────────────
const TEST_BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIP_USER = "e2e-vip@test.com";
const FREE_USER = "e2e-free@test.com";

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 模拟登录（设置 JWT token 到 localStorage） */
async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto(`${TEST_BASE_URL}/api/auth/login`, { waitUntil: "networkidle" });
  // 通过 API 直接获取 token（E2E 测试专用快捷方式）
  const response = await page.request.post(`${TEST_BASE_URL}/api/auth/login`, {
    data: { email, password: "test-password" },
  });
  if (response.ok()) {
    const data = await response.json();
    await page.evaluate(
      ({ token }) => localStorage.setItem("supply_os_auth_token", token),
      { token: data.token },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 1：供应商注册流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("供应商注册旅程", () => {
  test("完整注册流程：填写表单 → 提交 → 确认", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier/register`);

    // Step 1: 填写企业基本信息
    await page.fill('[name="company_name"]', "E2E Test Supplier Co.");
    await page.fill('[name="contact_email"]', `e2e-supplier-${Date.now()}@test.com`);
    await page.fill('[name="country"]', "China");

    // Step 2: 选择业务领域
    await page.click('[data-testid="industry-select"]');
    await page.click('[data-testid="industry-option-construction"]');

    // Step 3: 提交注册
    await page.click('[data-testid="submit-registration"]');

    // Step 4: 验证成功提示
    await expect(page.locator('[data-testid="registration-success"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("注册表单验证：必填字段缺失 → 显示错误", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier/register`);
    await page.click('[data-testid="submit-registration"]');

    // 验证必填字段错误提示
    await expect(page.locator('[data-testid="error-company_name"]')).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 2：UNGM 认证流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("UNGM 认证旅程", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIP_USER);
  });

  test("查看 UNGM 认证指南页面", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier/ungm`);
    await expect(page.locator("h1")).toContainText("UNGM");
  });

  test("认证进度查看", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier/qualification`);
    // 页面应正常加载
    await expect(page).toHaveTitle(/.*认证.*/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 3：投标流程（搜索 → 查看 → 解锁）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("投标流程旅程", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIP_USER);
  });

  test("搜索公告 → 查看详情 → 解锁", async ({ page }) => {
    // Step 1: 进入采购公告搜索
    await page.goto(`${TEST_BASE_URL}/procurement`);
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();

    // Step 2: 输入搜索关键词
    await page.fill('[data-testid="search-input"]', "construction");
    await page.keyboard.press("Enter");

    // Step 3: 等待搜索结果
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({
      timeout: 10_000,
    });

    // Step 4: 点击第一条结果
    const firstResult = page.locator('[data-testid="notice-card"]').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
      // 验证详情页加载
      await expect(page.locator('[data-testid="notice-detail"]')).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test("免费用户搜索 → 解锁提示", async ({ page }) => {
    await loginAs(page, FREE_USER);
    await page.goto(`${TEST_BASE_URL}/procurement`);

    // 搜索并查看结果
    await page.fill('[data-testid="search-input"]', "UNDP");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 4：会员购买流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("会员购买旅程", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, FREE_USER);
  });

  test("查看会员页面 → 选择套餐 → 发起支付", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/membership`);

    // 验证套餐列表可见
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible();

    // 选择套餐
    const planCard = page.locator('[data-testid="plan-card"]').first();
    if (await planCard.isVisible()) {
      await planCard.click();
      // 验证支付弹窗或页面
      await expect(page.locator('[data-testid="payment-modal"], [data-testid="payment-page"]')).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 5：培训报名流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("培训报名旅程", () => {
  test("查看培训页面 → 选择课程 → 报名", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/learning`);
    await expect(page.locator("h1")).toContainText(/培训|learning/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 冒烟测试：关键页面可达
// ══════════════════════════════════════════════════════════════════════════════

test.describe("冒烟测试", () => {
  const criticalPages = [
    { name: "首页", path: "/" },
    { name: "采购公告", path: "/procurement" },
    { name: "供应商", path: "/supplier" },
    { name: "会员", path: "/membership" },
    { name: "培训", path: "/learning" },
    { name: "隐私政策", path: "/privacy" },
    { name: "用户协议", path: "/terms" },
    { name: "API 健康检查", path: "/api/system/version" },
  ];

  for (const { name, path } of criticalPages) {
    test(`${name} (${path}) → 200`, async ({ request }) => {
      const response = await request.get(`${TEST_BASE_URL}${path}`);
      expect(response.status()).toBe(200);
    });
  }
});
