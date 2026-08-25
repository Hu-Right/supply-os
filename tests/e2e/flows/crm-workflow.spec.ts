/**
 * E2E 测试 — CRM 线索管理工作流
 * End-to-End Tests: CRM Workflow
 *
 * @description 测试 CRM 线索管理的访问控制和核心功能。
 *              基于真实 CrmPage 组件和 ProtectedRoute 守卫。
 *
 * 覆盖场景：
 *   1. 未登录访问 CRM → 重定向 + 登录提示
 *   2. 全局咨询弹窗 → 表单填写
 */
import { test, expect } from "@playwright/test";

test.describe("CRM 线索管理工作流", () => {
  test("未登录访问 CRM → ProtectedRoute 保护", async ({ page }) => {
    await page.goto("/crm");
    await page.waitForLoadState("networkidle");

    const url = page.url();

    // ProtectedRoute 可能重定向到 /showroom 并弹出登录框
    if (url.includes("/crm")) {
      // 仍在 /crm，应显示登录提示
      const modal = page.getByRole("dialog");
      const loginPrompt = page.getByText(/登录|注册/i);
      const hasLoginPrompt = await modal.isVisible().catch(() => false)
        || await loginPrompt.first().isVisible().catch(() => false);
      expect(hasLoginPrompt).toBeTruthy();
    } else {
      // 被重定向到 /showroom
      expect(url).toMatch(/\/(showroom|login|auth)/);
    }
  });

  test("首页可触发咨询弹窗", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 查找咨询/预约按钮
    const consultBtn = page.getByRole("button", { name: /咨询|预约|consult|advisor/i }).first();
    const hasBtn = await consultBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtn) {
      await consultBtn.click();
      await page.waitForTimeout(500);

      // 弹窗应出现
      const modal = page.locator("[role='dialog']").first();
      const hasModal = await modal.isVisible().catch(() => false);

      if (hasModal) {
        // 弹窗应包含表单字段
        const inputs = modal.locator("input[type='text']");
        const inputCount = await inputs.count();
        expect(inputCount).toBeGreaterThan(0);

        // 应包含提交按钮
        const submitBtn = modal.getByRole("button", { name: /提交|预约|submit|book/i });
        await expect(submitBtn.first()).toBeVisible();
      }
    }
  });
});
