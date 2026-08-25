/**
 * E2E 前端测试 — 路由与布局
 * Frontend-only E2E Tests: Routes & Layout
 *
 * @description 无需后端，使用 Vite dev server + API mock。
 *              测试路由重定向、布局组件、离线提示等纯前端功能。
 */
import { test, expect } from "@playwright/test";
import { mockEmptyApis } from "./helpers";

test.describe("路由重定向（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
  });

  test("首页 / → 重定向到 /showroom", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/showroom/, { timeout: 10_000 });
  });

  test("404 路由 → 重定向到 /showroom", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page).toHaveURL(/\/showroom/, { timeout: 10_000 });
  });
});

test.describe("Header 布局（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
    await page.goto("/showroom");
    await page.waitForLoadState("domcontentloaded");
  });

  test("品牌名称可见", async ({ page }) => {
    // 中文环境显示中文品牌名
    const brand = page.locator("header h1");
    await expect(brand).toBeVisible();
    // 品牌名包含"公采"或"Portal"
    const text = await brand.textContent();
    expect(text).toBeTruthy();
  });

  test("用户按钮可见（未登录显示游客模式）", async ({ page }) => {
    // 未登录状态显示"游客模式"按钮
    const authButton = page.locator("header button:has-text(\"游客\")");
    await expect(authButton).toBeVisible({ timeout: 5000 });
  });

  test("桌面导航栏可见", async ({ page }) => {
    // 桌面端导航栏（深色背景）
    const nav = page.locator("nav.bg-slate-900, nav:has(button)");
    await expect(nav).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Footer 布局（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
    await page.goto("/showroom");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Footer 版权信息可见", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // 版权文本
    const copyright = footer.getByText(/©|版权|Reserved/i);
    await expect(copyright).toBeVisible();
  });

  test("Footer 链接可见", async ({ page }) => {
    const footer = page.locator("footer");
    // Footer 右侧有服务协议/隐私保护/UNSPSC 链接（可能是 span 或 a）
    const termsLink = footer.getByText(/服务协议|Terms/i);
    await expect(termsLink).toBeVisible();
  });
});

test.describe("NetworkBanner（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
  });

  test("离线状态显示提示", async ({ page }) => {
    await page.goto("/showroom");
    await page.waitForLoadState("domcontentloaded");

    // 等待页面完全渲染后再模拟离线
    await page.waitForTimeout(500);

    // 模拟离线：设置网络状态 + 手动触发事件
    await page.context().setOffline(true);
    // 使用 page.evaluate 确保事件在页面上下文中触发
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // 等待离线提示出现（NetworkBanner 使用 navigator.onLine + 事件监听）
    const offlineBanner = page.locator(".fixed.top-0.bg-rose-600, [class*='bg-rose-600']");
    await expect(offlineBanner).toBeVisible({ timeout: 10_000 });

    // 恢复在线
    await page.context().setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    // 离线提示应消失
    await expect(offlineBanner).not.toBeVisible({ timeout: 10_000 });
  });
});
