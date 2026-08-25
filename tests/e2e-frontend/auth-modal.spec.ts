/**
 * E2E 前端测试 — 认证弹窗
 * Frontend-only E2E Tests: Auth Modal
 *
 * @description 无需后端，测试 AuthModal UI 交互。
 *              登录/注册 tab 切换、表单验证、忘记密码视图。
 */
import { test, expect } from "@playwright/test";
import { mockEmptyApis, mockLoginFailed } from "./helpers";

test.describe("认证弹窗 UI（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
    await page.goto("/showroom");
    await page.waitForLoadState("domcontentloaded");
  });

  test("点击用户按钮 → 打开 AuthModal", async ({ page }) => {
    // 点击"游客模式"按钮
    const authButton = page.locator("header button:has-text(\"游客\")");
    await authButton.click();

    // 弹窗可见
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 弹窗标题
    await expect(modal.getByText("会员登录")).toBeVisible();
  });

  test("默认显示登录 tab", async ({ page }) => {
    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 登录表单元素可见
    await expect(modal.getByPlaceholder("邮箱 / 手机号")).toBeVisible();
    await expect(modal.getByPlaceholder(/密码/)).toBeVisible();
    await expect(modal.getByRole("button", { name: "登录会员" })).toBeVisible();
  });

  test("切换到注册 tab", async ({ page }) => {
    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 点击注册 tab
    await modal.getByRole("button", { name: /注册/ }).click();

    // 注册 tab 按钮可见（精确匹配 tab 名称）
    const registerTab = modal.getByRole("button", { name: "注册供应商" });
    await expect(registerTab).toBeVisible();

    // 注册 tab 激活样式
    await expect(registerTab).toHaveClass(/bg-white/);
  });

  test("空表单提交 → 弹窗保持打开", async ({ page }) => {
    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 直接点击登录
    await modal.getByRole("button", { name: "登录会员" }).click();

    // 弹窗仍然可见
    await expect(modal).toBeVisible();
    // URL 未变
    await expect(page).toHaveURL(/\/showroom/);
  });

  test("错误凭证 → 显示错误提示", async ({ page }) => {
    // Mock 登录失败
    await mockLoginFailed(page);

    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 填写凭证
    await modal.getByPlaceholder("邮箱 / 手机号").fill("wrong@test.com");
    await modal.getByPlaceholder(/密码/).fill("WrongPass123");

    // 提交
    await modal.getByRole("button", { name: "登录会员" }).click();

    // 错误提示可见
    const errorText = modal.locator(".text-rose-600");
    await expect(errorText).toBeVisible({ timeout: 10_000 });
  });

  test("忘记密码 → 视图切换", async ({ page }) => {
    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 点击忘记密码
    await modal.getByText("忘记密码").click();

    // 找回密码视图
    const forgotTitle = modal.getByText(/找回/);
    await expect(forgotTitle).toBeVisible();

    // 返回登录
    const backLink = modal.getByText(/返回/);
    await expect(backLink).toBeVisible();
    await backLink.click();

    // 回到登录表单
    await expect(modal.getByRole("button", { name: "登录会员" })).toBeVisible();
  });

  test("关闭弹窗 → 回到主页面", async ({ page }) => {
    // 打开弹窗
    await page.locator("header button:has-text(\"游客\")").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 点击 ESC 关闭
    await page.keyboard.press("Escape");

    // 弹窗消失
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
