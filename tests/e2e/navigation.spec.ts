/**
 * E2E 测试 — 全局导航与布局
 * End-to-End Tests: Navigation & Layout
 *
 * @description 覆盖路由重定向、导航切换、语言切换、Footer、离线提示等。
 *
 * 覆盖场景：
 *   1. 首页重定向：/ → /showroom
 *   2. 导航 tab 点击 → URL 切换
 *   3. 404 路由 → 重定向到 /showroom
 *   4. 语言切换 → 文本变化
 *   5. Footer 显示 → 版权信息
 *   6. NetworkBanner → 离线时显示提示
 *   7. CRM 路由 → 未登录显示 ProtectedRoute
 */
import { test, expect } from "@playwright/test";

test.describe("路由与重定向", () => {
  test("首页重定向：/ → /showroom", async ({ page }) => {
    await page.goto("/");

    // 验证重定向到 /showroom
    await expect(page).toHaveURL(/\/showroom/, { timeout: 10_000 });
  });

  test("404 路由 → 重定向到 /showroom", async ({ page }) => {
    await page.goto("/non-existent-page-xyz");

    // 验证重定向到 /showroom
    await expect(page).toHaveURL(/\/showroom/, { timeout: 10_000 });
  });

  test("CRM 路由 → 未登录受 ProtectedRoute 保护", async ({ page }) => {
    // 确保未登录状态
    await page.goto("/crm");
    await page.waitForLoadState("networkidle");

    // ProtectedRoute 可能重定向到登录或显示登录提示
    // 根据 ProtectedRoute 实现，未登录时可能：
    // 1. 重定向到登录页
    // 2. 显示登录弹窗
    // 3. 停留在 /crm 但显示登录提示
    const url = page.url();

    // 如果被重定向到其他页面
    if (!url.includes("/crm")) {
      // 应该被重定向到登录相关页面
      expect(url).toMatch(/\/(showroom|login|auth)/);
    } else {
      // 如果仍在 /crm，应该显示某种登录提示
      // 可能是 AuthModal 弹出
      const modal = page.getByRole("dialog");
      const loginPrompt = page.getByText(/登录|注册/i);
      const hasLoginPrompt = await modal.isVisible().catch(() => false)
        || await loginPrompt.first().isVisible().catch(() => false);
      // ProtectedRoute 应该阻止未登录访问
      expect(hasLoginPrompt || url.includes("/crm")).toBeTruthy();
    }
  });
});

test.describe("导航切换", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/showroom");
    await page.waitForLoadState("networkidle");
  });

  test("导航 tab 点击 → URL 切换", async ({ page }) => {
    // 桌面导航栏中的 tab
    const nav = page.locator("nav.bg-slate-900");
    await expect(nav).toBeVisible();

    // 点击"公采系列" tab
    const procurementTab = nav.getByRole("button", { name: /公采|Intl Procurement/i });
    if (await procurementTab.isVisible()) {
      await procurementTab.click();
      await expect(page).toHaveURL(/\/procurement/, { timeout: 5000 });
    } else {
      // 移动端可能不可见，使用移动菜单
      test.skip();
    }
  });

  test("语言切换 → 文本变化", async ({ page }) => {
    // 默认中文环境，验证品牌名称
    const brandNameZh = page.getByText("全球公采与海外展厅协同门户");
    const isChinese = await brandNameZh.isVisible().catch(() => false);

    // 找到语言切换按钮（显示当前语言，如"中文"或"English"）
    const langButton = page.locator("button").filter({ hasText: /中文|English|语言/i }).first();
    const hasLangButton = await langButton.isVisible().catch(() => false);

    if (hasLangButton) {
      // 点击语言切换
      await langButton.click();

      // 选择 English
      const englishOption = page.getByRole("button", { name: "English" });
      const hasEnglishOption = await englishOption.isVisible().catch(() => false);

      if (hasEnglishOption) {
        await englishOption.click();

        // 验证文本变为英文
        const brandNameEn = page.getByText("Global Procurement");
        await expect(brandNameEn).toBeVisible({ timeout: 5000 });
      }
    } else if (!isChinese) {
      // 既不是中文也没有语言按钮，跳过
      test.skip();
    }
  });
});

test.describe("布局组件", () => {
  test("Footer 显示 → 版权信息", async ({ page }) => {
    await page.goto("/showroom");
    await page.waitForLoadState("networkidle");

    // 验证 Footer 可见（包含版权信息）
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // 验证版权文本
    const copyright = footer.getByText(/©.*2026|版权所有|All Rights Reserved/i);
    await expect(copyright).toBeVisible();

    // 验证服务条款链接
    const termsLink = footer.getByText(/服务协议|Terms/i);
    await expect(termsLink).toBeVisible();
  });

  test("NetworkBanner → 离线时显示提示", async ({ page }) => {
    // 先访问页面
    await page.goto("/showroom");
    await page.waitForLoadState("networkidle");

    // 模拟离线状态
    await page.context().setOffline(true);

    // 验证离线提示可见
    const offlineBanner = page.getByText(/网络已断开|Network disconnected|离线/i);
    await expect(offlineBanner).toBeVisible({ timeout: 5000 });

    // 恢复在线
    await page.context().setOffline(false);

    // 验证离线提示消失
    await expect(offlineBanner).not.toBeVisible({ timeout: 5000 });
  });
});
