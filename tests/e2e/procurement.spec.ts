/**
 * E2E 测试 — 公采搜索流程
 * End-to-End Tests: Procurement Search Flow
 *
 * @description 覆盖公告搜索、筛选、详情查看、解锁等核心路径。
 *              需要安装 @playwright/test 后执行。
 */
import { test, expect } from "@playwright/test";

test.describe("公采搜索", () => {
  test.beforeEach(async ({ page }) => {
    // 模拟登录状态
    await page.evaluate(() => {
      localStorage.setItem("supply_os_auth_token", "mock-jwt-token");
    });
  });

  test("搜索公告 → 查看结果列表", async ({ page }) => {
    await page.goto("/procurement");

    // 输入搜索关键词
    await page.fill('[data-testid="search-input"]', "water supply");
    await page.press('[data-testid="search-input"]', "Enter");

    // 等待搜索结果加载
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

    // 验证结果列表非空
    const results = page.locator('[data-testid="notice-card"]');
    await expect(results.first()).toBeVisible();
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });

  test("按国家筛选搜索结果", async ({ page }) => {
    await page.goto("/procurement");

    // 先搜索
    await page.fill('[data-testid="search-input"]', "construction");
    await page.press('[data-testid="search-input"]', "Enter");
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

    // 选择国家筛选
    await page.click('[data-testid="country-filter"]');
    await page.fill('[data-testid="country-search-input"]', "Kenya");
    await page.click('[data-testid="country-option-Kenya"]');

    // 验证结果已更新
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test("查看公告详情", async ({ page }) => {
    await page.goto("/procurement");

    // 搜索并点击第一条结果
    await page.fill('[data-testid="search-input"]', "IT services");
    await page.press('[data-testid="search-input"]', "Enter");
    await expect(page.locator('[data-testid="notice-card"]')).toBeVisible();

    await page.click('[data-testid="notice-card"] >> nth=0');

    // 验证详情页加载
    await expect(page.locator('[data-testid="notice-detail"]')).toBeVisible();
    await expect(page.locator('[data-testid="notice-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="notice-agency"]')).toBeVisible();
    await expect(page.locator('[data-testid="notice-deadline"]')).toBeVisible();
  });

  test("搜索建议下拉", async ({ page }) => {
    await page.goto("/procurement");

    // 输入部分关键词
    await page.fill('[data-testid="search-input"]', "uni");

    // 验证搜索建议下拉出现
    await expect(page.locator('[data-testid="search-dropdown"]')).toBeVisible();

    // 选择一条建议
    await page.click('[data-testid="search-suggestion"] >> nth=0');

    // 验证搜索框已填充选中值
    const value = await page.inputValue('[data-testid="search-input"]');
    expect(value).toBeTruthy();
  });

  test("切换搜索模式（宽搜/精搜）", async ({ page }) => {
    await page.goto("/procurement");

    // 默认宽搜模式
    await expect(page.locator('[data-testid="search-mode-wide"]')).toBeChecked();

    // 切换到精搜模式
    await page.click('[data-testid="search-mode-precise"]');
    await expect(page.locator('[data-testid="search-mode-precise"]')).toBeChecked();

    // 精搜模式下应显示更多筛选条件
    await expect(page.locator('[data-testid="advanced-filters"]')).toBeVisible();
  });
});

test.describe("公告解锁", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("supply_os_auth_token", "mock-jwt-token");
    });
  });

  test("未解锁公告 → 显示解锁按钮", async ({ page }) => {
    await page.goto("/procurement");
    await page.fill('[data-testid="search-input"]', "medical equipment");
    await page.press('[data-testid="search-input"]', "Enter");
    await expect(page.locator('[data-testid="notice-card"]')).toBeVisible();

    // 点击第一条公告
    await page.click('[data-testid="notice-card"] >> nth=0');
    await expect(page.locator('[data-testid="notice-detail"]')).toBeVisible();

    // 未解锁状态应显示解锁按钮
    await expect(page.locator('[data-testid="unlock-button"]')).toBeVisible();
  });

  test("解锁公告 → 查看全文", async ({ page }) => {
    await page.goto("/procurement");
    await page.fill('[data-testid="search-input"]', "infrastructure");
    await page.press('[data-testid="search-input"]', "Enter");
    await expect(page.locator('[data-testid="notice-card"]')).toBeVisible();

    await page.click('[data-testid="notice-card"] >> nth=0');
    await expect(page.locator('[data-testid="notice-detail"]')).toBeVisible();

    // 点击解锁
    await page.click('[data-testid="unlock-button"]');

    // 验证解锁成功，全文可见
    await expect(page.locator('[data-testid="notice-full-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="unlock-button"]')).not.toBeVisible();
  });
});
