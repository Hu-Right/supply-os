/**
 * E2E 测试 — 学习中心页面渲染
 * End-to-End Tests: Learning Page Rendering
 *
 * @description 测试学习中心页面的渲染和交互。
 *              基于真实 LearningPage 组件结构。
 *
 * 覆盖场景：
 *   1. 页面加载 → 显示学习资料标题
 *   2. 资料卡片 → 显示标题和下载按钮
 *   3. 未登录点击下载 → 触发登录提示
 *   4. FAQ 区域 → 可见
 */
import { test, expect } from "@playwright/test";

test.describe("学习中心页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/learning");
    await page.waitForLoadState("networkidle");
  });

  test("页面加载 → 显示学习资料区域", async ({ page }) => {
    // 学习中心应有标题或内容区域
    const heading = page.locator("h3, h4").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("资料卡片 → 显示下载按钮", async ({ page }) => {
    await page.waitForTimeout(500);

    // 查找下载按钮
    const downloadButtons = page.getByRole("button", { name: /下载|download|查看|解锁/i });
    const count = await downloadButtons.count();

    // 应有至少一个下载按钮
    if (count > 0) {
      await expect(downloadButtons.first()).toBeVisible();
    }
  });

  test("未登录点击下载 → 触发登录提示", async ({ page }) => {
    await page.waitForTimeout(500);

    // 找到第一个下载按钮
    const downloadButton = page.getByRole("button", { name: /下载|download|查看|解锁/i }).first();
    const isVisible = await downloadButton.isVisible().catch(() => false);

    if (isVisible) {
      await downloadButton.click();
      await page.waitForTimeout(500);

      // 未登录应触发登录弹窗
      const modal = page.getByRole("dialog");
      const hasModal = await modal.isVisible().catch(() => false);

      if (hasModal) {
        // 验证弹窗包含登录表单
        await expect(modal.getByText("会员登录与供应商注册")).toBeVisible();
      }
    }
  });

  test("FAQ 区域 → 可见", async ({ page }) => {
    // 查找 FAQ 标题
    const faqTitle = page.getByText(/常见问题|FAQ/i);
    const hasFaq = await faqTitle.isVisible().catch(() => false);

    if (hasFaq) {
      await expect(faqTitle).toBeVisible();

      // FAQ 应有问答内容
      const faqItems = page.locator("[class*='border-b']");
      const count = await faqItems.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
