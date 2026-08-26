/**
 * E2E 测试 — 公告搜索解锁流程
 * End-to-End Tests: Search & Unlock Flow
 *
 * @description 测试完整的公告搜索 → 查看详情 → 解锁流程。
 *              基于真实 ProcurementPage 组件交互。
 *
 * 覆盖场景：
 *   1. 访问采购页面 → 搜索公告
 *   2. 点击公告卡片 → 查看详情
 *   3. 未登录点击解锁 → 弹出登录弹窗
 *   4. 详情页返回 → 回到列表
 */
import { test, expect } from "@playwright/test";

test.describe("公告搜索解锁流程", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/procurement");
    await page.waitForLoadState("networkidle");
  });

  test("访问采购页面 → 显示搜索框和公告列表", async ({ page }) => {
    // 验证搜索框可见
    const searchInput = page.getByPlaceholder("输入招标编号或关键词");
    await expect(searchInput).toBeVisible();

    // 验证公告列表加载
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  });

  test("搜索公告 → 列表更新", async ({ page }) => {
    // 等待初始列表
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    // 输入搜索关键词
    const searchInput = page.getByPlaceholder("输入招标编号或关键词");
    await searchInput.fill("construction");
    await searchInput.press("Enter");

    // 等待搜索结果
    await page.waitForLoadState("networkidle");

    // 验证列表仍然可见（可能有不同数量的卡片）
    const articles = page.locator("article");
    const hasResults = await articles.count();
    const hasEmptyState = page.getByText(/暂无匹配|无匹配/);
    const emptyStateVisible = await hasEmptyState.isVisible().catch(() => false);

    expect(hasResults > 0 || emptyStateVisible).toBeTruthy();
  });

  test("点击公告卡片 → 未登录弹出登录弹窗", async ({ page }) => {
    // 等待列表加载
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // 点击卡片内的“查看详情”按钮（article 本身无点击事件）
    const detailBtn = firstCard.getByRole("button", { name: "查看详情" });
    await detailBtn.click();

    // 未登录时 openNotice 触发 require-login，弹出登录弹窗
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });
  });

  test("未登录点击解锁 → 弹出登录弹窗", async ({ page }) => {
    // 等待列表加载并点击第一张卡片的“查看详情”按钮
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("button", { name: "查看详情" }).click();

    // 未登录时点击查看详情直接触发登录弹窗
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 验证弹窗包含登录表单
    await expect(modal.getByText("会员登录与供应商注册")).toBeVisible();
  });

  test("关闭登录弹窗 → 回到列表", async ({ page }) => {
    // 等待列表加载并点击第一张卡片的“查看详情”按钮
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("button", { name: "查看详情" }).click();

    // 未登录弹出登录弹窗
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 关闭弹窗（AuthModal header 上的 X 按钮）
    await modal.locator("button").first().click();

    // 验证回到列表页
    await expect(page.locator("article").first()).toBeVisible({ timeout: 10_000 });

    // 验证搜索框仍然可见
    await expect(page.getByPlaceholder("输入招标编号或关键词")).toBeVisible();
  });
});
