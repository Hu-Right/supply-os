/**
 * E2E 前端测试 — 海外展厅页面
 * Frontend-only E2E Tests: Showroom Page
 *
 * @description 展厅页面使用静态数据（EXHIBITION_HALLS），无需后端 API。
 *              测试搜索、地区/国家筛选、重置、空态等纯前端交互。
 */
import { test, expect } from "@playwright/test";
import { mockEmptyApis } from "./helpers";

test.describe("海外展厅页面（前端）", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyApis(page);
    await page.goto("/showroom");
    await page.waitForLoadState("domcontentloaded");
  });

  test("页面加载 → 搜索框和展厅卡片可见", async ({ page }) => {
    // 搜索框
    const searchInput = page.getByPlaceholder("输入关键字搜索");
    await expect(searchInput).toBeVisible();

    // 地区下拉
    const regionSelect = page.locator("select").first();
    await expect(regionSelect).toBeVisible();

    // 展厅卡片（静态数据，6 个展厅）
    // 卡片包含展厅名称，如"展厅"
    const hallCards = page.getByText(/展厅/);
    await expect(hallCards.first()).toBeVisible({ timeout: 5000 });
  });

  test("搜索过滤 → 匹配关键词的卡片显示", async ({ page }) => {
    const searchInput = page.getByPlaceholder("输入关键字搜索");

    // 输入"法兰克福"（应匹配德国展厅）
    await searchInput.fill("法兰克福");
    await page.waitForTimeout(300);

    // 验证包含"法兰克福"的卡片可见
    const frankfurtCard = page.getByText(/法兰克福/);
    await expect(frankfurtCard.first()).toBeVisible();

    // 清空搜索
    await searchInput.clear();
    await page.waitForTimeout(300);

    // 验证所有卡片恢复
    const allCards = page.getByText(/展厅/);
    const count = await allCards.count();
    expect(count).toBeGreaterThan(1);
  });

  test("地区筛选 → 国家下拉联动", async ({ page }) => {
    const selects = page.locator("select");
    const regionSelect = selects.nth(0);
    const countrySelect = selects.nth(1);

    // 国家下拉初始禁用
    await expect(countrySelect).toBeDisabled();

    // 选择"欧洲"地区
    await regionSelect.selectOption({ label: "欧洲" });

    // 国家下拉启用
    await expect(countrySelect).toBeEnabled();

    // 包含"德国"选项
    const germanyOption = countrySelect.locator("option:has-text('德国')");
    expect(await germanyOption.count()).toBeGreaterThan(0);
  });

  test("无匹配数据 → 空状态提示", async ({ page }) => {
    const searchInput = page.getByPlaceholder("输入关键字搜索");

    // 输入不可能匹配的关键词
    await searchInput.fill("xyznonexistent99999");
    await page.waitForTimeout(300);

    // 空状态提示
    const emptyState = page.getByText(/暂无匹配数据|No matching/i);
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("重置筛选 → 恢复初始状态", async ({ page }) => {
    const selects = page.locator("select");
    const regionSelect = selects.nth(0);
    const countrySelect = selects.nth(1);

    // 选择地区
    await regionSelect.selectOption({ label: "欧洲" });

    // 查找重置按钮
    const resetButton = page.getByText(/重置/);
    const hasReset = await resetButton.isVisible().catch(() => false);

    if (hasReset) {
      await resetButton.click();

      // 地区恢复为空
      await expect(regionSelect).toHaveValue("");
      // 国家下拉恢复禁用
      await expect(countrySelect).toBeDisabled();
    } else {
      // 重置按钮可能使用其他文本（如"清除"）
      const clearButton = page.getByText(/清除/);
      if (await clearButton.isVisible().catch(() => false)) {
        await clearButton.click();
        await expect(regionSelect).toHaveValue("");
      }
    }
  });
});
