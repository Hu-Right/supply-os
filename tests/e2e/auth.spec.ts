/**
 * E2E 测试 — 认证流程
 * End-to-End Tests: Authentication Flow
 *
 * @description 使用 Playwright 测试用户认证核心路径。
 *              认证通过 AuthModal 弹窗完成（非独立页面）。
 *
 * 覆盖场景：
 *   1. 打开 AuthModal → 默认显示登录 tab
 *   2. 切换到注册 tab → 显示注册表单
 *   3. 空表单提交 → 不触发页面跳转
 *   4. 错误凭证登录 → 显示错误提示
 *   5. 忘记密码 → 切换到找回密码视图
 */
import { test, expect } from "@playwright/test";

test.describe("认证弹窗", () => {
  test.beforeEach(async ({ page }) => {
    // 访问首页，等待页面加载完成
    await page.goto("/showroom");
    await page.waitForLoadState("networkidle");
  });

  test("打开 AuthModal → 默认显示登录 tab", async ({ page }) => {
    // 点击头部用户按钮（未登录状态显示"游客模式"）打开认证弹窗
    const authButton = page.locator("header button:has-text(\"游客模式\")");
    await authButton.click();

    // 验证弹窗标题可见
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("会员登录与供应商注册")).toBeVisible();

    // 验证默认显示登录 tab（登录 tab 处于激活状态，有白色背景）
    // exact: true 避免匹配到“登录会员”提交按钮
    const loginTab = modal.getByRole("button", { name: "登录", exact: true });
    await expect(loginTab).toBeVisible();

    // 验证登录表单元素可见
    await expect(modal.getByPlaceholder("邮箱 / 手机号")).toBeVisible();
    await expect(modal.getByPlaceholder(/密码/)).toBeVisible();
    await expect(modal.getByRole("button", { name: "登录会员" })).toBeVisible();
  });

  test("切换到注册 tab → 显示注册表单", async ({ page }) => {
    // 打开认证弹窗
    await page.locator("header button:has-text(\"游客模式\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // 点击注册 tab
    const registerTab = modal.getByRole("button", { name: "注册供应商" });
    await registerTab.click();

    // 验证注册表单元素可见（公司名称、邮箱、密码等）
    // 注册表单邮箱占位符为“邮箱”（登录表单才是“邮箱 / 手机号”），可能有多个输入匹配，取第一个
    await expect(modal.getByPlaceholder("邮箱").first()).toBeVisible();
    await expect(modal.getByRole("button", { name: "注册并提交供应商申请" })).toBeVisible();

    // 验证登录 tab 不再激活（注册 tab 激活）
    // 注册 tab 应有白色背景样式
    await expect(registerTab).toHaveClass(/bg-white/);
  });

  test("空表单提交 → 不触发页面跳转", async ({ page }) => {
    // 打开认证弹窗
    await page.locator("header button:has-text(\"游客模式\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // 直接点击登录按钮（不填写任何内容）
    await modal.getByRole("button", { name: "登录会员" }).click();

    // 验证弹窗仍然可见（没有关闭或跳转）
    await expect(modal).toBeVisible();

    // 验证 URL 未变化
    await expect(page).toHaveURL(/\/showroom/);
  });

  test("错误凭证登录 → 显示错误提示", async ({ page }) => {
    // 打开认证弹窗
    await page.locator("header button:has-text(\"游客模式\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // 填写错误的登录凭证
    await modal.getByPlaceholder("邮箱 / 手机号").fill("wrong@example.com");
    await modal.getByPlaceholder(/密码/).fill("WrongPass123");

    // 提交登录
    await modal.getByRole("button", { name: "登录会员" }).click();

    // 验证显示错误提示（错误消息使用 rose-600 颜色类）
    const errorMessage = modal.locator(".text-rose-600");
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });
  });

  test("忘记密码 → 切换到找回密码视图", async ({ page }) => {
    // 打开认证弹窗
    await page.locator("header button:has-text(\"游客模式\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // 点击"忘记密码？"链接
    await modal.getByText("忘记密码？").click();

    // 验证找回密码表单可见
    // 找回密码视图有标题和邮箱/手机号输入框
    const forgotTitle = modal.getByText("找回密码");
    await expect(forgotTitle).toBeVisible();

    // 验证有发送验证码按钮
    const sendButton = modal.getByRole("button", { name: /发送/ });
    await expect(sendButton).toBeVisible();

    // 验证有返回登录链接
    const backLink = modal.getByText(/返回登录/);
    await expect(backLink).toBeVisible();

    // 点击返回登录
    await backLink.click();

    // 验证回到登录表单
    await expect(modal.getByRole("button", { name: "登录会员" })).toBeVisible();
  });
});
