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
// 旅程 1：供应商目录浏览
// ══════════════════════════════════════════════════════════════════════════════

test.describe("供应商目录旅程", () => {
  test("查看供应商列表 → 搜索过滤", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier`);

    // 验证页面加载成功（供应商列表区域可见）
    await expect(page.locator("text=供应商").first()).toBeVisible({ timeout: 10_000 });

    // 验证筛选控件存在
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
  });

  test("供应商注册弹窗：通过事件触发", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier`);

    // 供应商注册通过事件触发，验证页面可正常加载
    await expect(page).toHaveTitle(/Supplier/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 2：公采资质测试
// ══════════════════════════════════════════════════════════════════════════════

test.describe("公采资质旅程", () => {
  test("查看资质测试页面", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/procurement/qualification`);
    // 页面应正常加载
    await expect(page).toHaveTitle(/Procurement|Qualification|资质/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 3：投标流程（搜索 → 查看 → 解锁）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("投标流程旅程", () => {
  test("搜索公告 → 查看结果列表", async ({ page }) => {
    // Step 1: 进入采购公告搜索
    await page.goto(`${TEST_BASE_URL}/procurement`);
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible({ timeout: 10_000 });

    // Step 2: 输入搜索关键词
    await page.fill('[data-testid="search-input"]', "construction");
    await page.keyboard.press("Enter");

    // Step 3: 等待搜索结果（搜索区域可见）
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("搜索结果 → 公告卡片可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/procurement`);

    // 等待搜索输入框和结果区域加载
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible({ timeout: 10_000 });

    // 等待公告卡片加载（至少一个可见）
    const noticeCard = page.locator('[data-testid="notice-card"]').first();
    await expect(noticeCard).toBeVisible({ timeout: 15_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 4：会员购买流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("会员购买旅程", () => {
  test("查看会员页面 → 套餐列表可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/membership`);

    // 验证套餐列表可见
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible({ timeout: 10_000 });

    // 验证至少一个套餐卡片可见
    const planCard = page.locator('[data-testid="plan-card"]').first();
    await expect(planCard).toBeVisible({ timeout: 5_000 });
  });

  test("套餐卡片 → 价格和功能展示", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/membership`);

    // 等待套餐列表加载
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible({ timeout: 10_000 });

    // 验证套餐卡片包含价格信息
    const planCard = page.locator('[data-testid="plan-card"]').first();
    await expect(planCard).toContainText("¥");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 5：学习中心
// ══════════════════════════════════════════════════════════════════════════════

test.describe("学习中心旅程", () => {
  test("查看学习中心页面 → 资料列表可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/learning`);

    // 页面标题验证
    await expect(page).toHaveTitle(/Learning|学习/i);

    // 验证页面内容加载（学习资料区域）
    await expect(page.locator("h3").first()).toBeVisible({ timeout: 10_000 });
  });

  test("学习中心 → 资料卡片展示", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/learning`);

    // 等待页面加载完成
    await expect(page).toHaveTitle(/Learning/i);

    // 验证学习资料区域存在
    const learningSection = page.locator("text=学习资料").first();
    // 如果找不到中文，尝试英文
    if (!await learningSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(page.locator("h3").first()).toBeVisible();
    }
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
