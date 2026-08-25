/**
 * E2E 测试 — 认证流程
 * End-to-End Tests: Authentication Flow
 *
 * @description 使用 Playwright 测试用户认证核心路径。
 *              需要安装 @playwright/test 并配置 playwright.config.ts 后执行。
 *              运行命令：npx playwright test tests/e2e/
 *
 * 覆盖场景：
 *   1. 注册 → 邮箱验证 → 自动登录
 *   2. 登录 → JWT 获取 → 页面跳转
 *   3. 登出 → Token 清除 → 重定向
 *   4. Token 过期 → 自动刷新
 *   5. 未登录访问受保护页面 → 重定向到登录
 */
import { test, expect } from "@playwright/test";

test.describe("认证流程", () => {
  test("用户注册 → 邮箱验证 → 自动登录", async ({ page }) => {
    // 1. 导航到注册页
    await page.goto("/auth/register");
    await expect(page).toHaveTitle(/注册/);

    // 2. 填写注册表单
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.fill('[data-testid="password-input"]', "Test@12345");
    await page.fill('[data-testid="confirm-password-input"]', "Test@12345");

    // 3. 勾选用户协议
    await page.check('[data-testid="agree-checkbox"]');

    // 4. 提交注册
    await page.click('[data-testid="register-button"]');

    // 5. 验证跳转到邮箱验证提示页
    await expect(page.locator('[data-testid="verify-prompt"]')).toBeVisible();
    await expect(page.locator('[data-testid="verify-email-display"]')).toContainText("test@example.com");

    // 6. 模拟邮箱验证（通过 URL 参数）
    await page.goto("/auth/verify?token=mock-verify-token&email=test@example.com");
    await expect(page.locator('[data-testid="verify-success"]')).toBeVisible();

    // 7. 验证自动登录成功（跳转到首页）
    await page.waitForURL("/");
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test("用户登录 → JWT 获取 → 页面跳转", async ({ page }) => {
    await page.goto("/auth/login");

    // 填写登录表单
    await page.fill('[data-testid="email-input"]', "user@example.com");
    await page.fill('[data-testid="password-input"]', "Password@123");
    await page.click('[data-testid="login-button"]');

    // 验证登录成功
    await page.waitForURL("/");
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // 验证 JWT Token 存储在 localStorage
    const token = await page.evaluate(() => localStorage.getItem("supply_os_auth_token"));
    expect(token).toBeTruthy();
  });

  test("登出 → Token 清除 → 重定向", async ({ page }) => {
    // 先登录
    await page.goto("/auth/login");
    await page.fill('[data-testid="email-input"]', "user@example.com");
    await page.fill('[data-testid="password-input"]', "Password@123");
    await page.click('[data-testid="login-button"]');
    await page.waitForURL("/");

    // 点击用户菜单 → 登出
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    // 验证重定向到登录页
    await page.waitForURL("/auth/login");

    // 验证 Token 已清除
    const token = await page.evaluate(() => localStorage.getItem("supply_os_auth_token"));
    expect(token).toBeNull();
  });

  test("未登录访问受保护页面 → 重定向到登录", async ({ page }) => {
    // 确保未登录
    await page.evaluate(() => localStorage.removeItem("supply_os_auth_token"));

    // 访问需要登录的个人中心
    await page.goto("/membership");

    // 应被重定向到登录页或显示登录弹窗
    await expect(page.locator('[data-testid="login-modal"], [data-testid="login-page"]')).toBeVisible();
  });

  test("登录凭证错误 → 显示错误提示", async ({ page }) => {
    await page.goto("/auth/login");

    await page.fill('[data-testid="email-input"]', "wrong@example.com");
    await page.fill('[data-testid="password-input"]', "WrongPassword@123");
    await page.click('[data-testid="login-button"]');

    // 验证显示错误消息
    await expect(page.locator('[data-testid="error-message"]')).toContainText(/密码错误|不存在|登录失败/);
  });
});

test.describe("忘记密码", () => {
  test("忘记密码 → 发送重置邮件 → 重置成功", async ({ page }) => {
    await page.goto("/auth/login");
    await page.click('[data-testid="forgot-password-link"]');

    // 填写邮箱
    await page.fill('[data-testid="reset-email-input"]', "user@example.com");
    await page.click('[data-testid="send-reset-button"]');

    // 验证发送成功提示
    await expect(page.locator('[data-testid="reset-sent-message"]')).toBeVisible();

    // 模拟通过重置链接设置新密码
    await page.goto("/auth/reset-password?token=mock-reset-token");
    await page.fill('[data-testid="new-password-input"]', "NewPassword@123");
    await page.fill('[data-testid="confirm-new-password-input"]', "NewPassword@123");
    await page.click('[data-testid="reset-password-button"]');

    // 验证重置成功并跳转到登录页
    await page.waitForURL("/auth/login");
    await expect(page.locator('[data-testid="reset-success-message"]')).toBeVisible();
  });
});
