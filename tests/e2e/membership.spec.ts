/**
 * E2E 测试 — 会员购买流程
 * End-to-End Tests: Membership Purchase Flow
 *
 * @description 覆盖套餐浏览、下单、支付、订单确认等核心路径。
 *              需要安装 @playwright/test 后执行。
 */
import { test, expect } from "@playwright/test";

test.describe("会员套餐浏览", () => {
  test("查看套餐列表", async ({ page }) => {
    await page.goto("/membership");

    // 验证套餐卡片展示
    const plans = page.locator('[data-testid="plan-card"]');
    await expect(plans.first()).toBeVisible();
    const count = await plans.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("套餐对比表", async ({ page }) => {
    await page.goto("/membership");

    // 查看对比表
    await page.click('[data-testid="comparison-toggle"]');
    await expect(page.locator('[data-testid="comparison-table"]')).toBeVisible();

    // 验证表头包含套餐名称
    const headers = page.locator('[data-testid="comparison-header"]');
    await expect(headers.first()).toBeVisible();
  });
});

test.describe("下单支付", () => {
  test.beforeEach(async ({ page }) => {
    // 模拟登录
    await page.evaluate(() => {
      localStorage.setItem("supply_os_auth_token", "mock-jwt-token");
    });
  });

  test("选择套餐 → 选择支付方式 → 下单", async ({ page }) => {
    await page.goto("/membership");

    // 选择一个套餐
    await page.click('[data-testid="plan-card"] >> nth=1');

    // 验证弹出支付方式选择
    await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible();

    // 选择支付宝
    await page.click('[data-testid="payment-option-alipay"]');

    // 点击确认下单
    await page.click('[data-testid="confirm-order-button"]');

    // 验证跳转到支付页面或显示二维码
    await expect(page.locator('[data-testid="payment-qr"], [data-testid="payment-redirect"]')).toBeVisible();
  });

  test("Mock 支付 → 自动完成", async ({ page }) => {
    await page.goto("/membership");

    // 选择套餐
    await page.click('[data-testid="plan-card"] >> nth=0');
    await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible();

    // 选择 Mock 支付
    await page.click('[data-testid="payment-option-mock"]');
    await page.click('[data-testid="confirm-order-button"]');

    // Mock 模式下 5 秒自动支付
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible({ timeout: 10000 });

    // 验证跳转到订单确认或会员状态页
    await expect(page.locator('[data-testid="membership-active"]')).toBeVisible();
  });
});

test.describe("订单历史", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("supply_os_auth_token", "mock-jwt-token");
    });
  });

  test("查看订单列表", async ({ page }) => {
    await page.goto("/payment/orders");

    // 验证订单列表加载
    await expect(page.locator('[data-testid="orders-list"]')).toBeVisible();
  });

  test("查看解锁记录", async ({ page }) => {
    await page.goto("/payment/unlocks");

    // 验证解锁记录列表加载
    await expect(page.locator('[data-testid="unlocks-list"]')).toBeVisible();
  });
});

test.describe("会员升级", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("supply_os_auth_token", "mock-jwt-token");
    });
  });

  test("预览升级差价", async ({ page }) => {
    await page.goto("/membership");

    // 当前为低档套餐，点击升级按钮
    await page.click('[data-testid="upgrade-button"]');

    // 验证显示升级预览（差价、次数保留、有效期追溯）
    await expect(page.locator('[data-testid="upgrade-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="price-diff"]')).toBeVisible();
  });
});
