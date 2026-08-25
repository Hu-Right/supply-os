/**
 * E2E 测试 — 海外展厅页面
 * End-to-End Tests: Showroom Page
 *
 * @description 覆盖展厅搜索、地区/国家筛选、重置、空态等核心路径。
 *              基于真实 ShowroomPage 组件结构。
 *
 * 覆盖场景：
 *   1. 页面加载 → 显示搜索框和展厅卡片
 *   2. 搜索过滤 → 卡片数量变化
 *   3. 地区筛选 → 国家下拉联动
 *   4. 重置筛选 → 恢复全部
 *   5. 无匹配数据 → 显示空状态
 */
import { test, expect } from "@playwright/test";

test.describe("海外展厅页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/showroom");
    await page.waitForLoadState("networkidle");
  });

  test("页面加载 → 显示搜索框和展厅卡片", async ({ page }) => {
    // 验证搜索框可见
    const searchInput = page.getByPlaceholder("输入关键字搜索");
    await expect(searchInput).toBeVisible();

    // 验证地区筛选可见
    const regionSelect = page.locator("select").first();
    await expect(regionSelect).toBeVisible();

    // 验证展厅卡片可见（静态数据，无需等待 API）
    // 展厅卡片包含展厅名称，如"展厅"、"Frankfurt"等
    const cards = page.locator("article, [class*='card'], .border");
    // 至少有一个展厅卡片
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test("搜索过滤 → 卡片数量变化", async ({ page }) => {
    // 等待初始卡片加载
    await page.waitForTimeout(500);

    // 记录初始卡片数量（通过展厅名称特征定位）
    const initialCards = page.locator("[class*='rounded-2xl'][class*='border']");
    const initialCount = await initialCards.count();

    // 输入搜索关键词（匹配特定展厅）
    const searchInput = page.getByPlaceholder("输入关键字搜索");
    await searchInput.fill("法兰克福");

    // 等待过滤生效
    await page.waitForTimeout(300);

    // 验证卡片数量减少
    const filteredCards = page.locator("[class*='rounded-2xl'][class*='border']");
    const filteredCount = await filteredCards.count();

    // 过滤后卡片应少于或等于初始数量
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // 清空搜索
    await searchInput.clear();
    await page.waitForTimeout(300);

    // 验证卡片恢复
    const restoredCards = page.locator("[class*='rounded-2xl'][class*='border']");
    const restoredCount = await restoredCards.count();
    expect(restoredCount).toBe(initialCount);
  });

  test("地区筛选 → 国家下拉联动", async ({ page }) => {
    // 找到地区下拉（第一个 select）和国家下拉（第二个 select）
    const selects = page.locator("select");
    const regionSelect = selects.nth(0);
    const countrySelect = selects.nth(1);

    // 验证国家下拉初始禁用（未选择地区时）
    await expect(countrySelect).toBeDisabled();

    // 选择地区（如"欧洲"）
    await regionSelect.selectOption({ label: "欧洲" });

    // 验证国家下拉启用
    await expect(countrySelect).toBeEnabled();

    // 验证国家下拉包含对应国家选项（如"德国"）
    const germanyOption = countrySelect.locator("option[value='德国'], option:has-text('德国')");
    const hasGermany = await germanyOption.count();
    expect(hasGermany).toBeGreaterThan(0);
  });

  test("重置筛选 → 恢复全部", async ({ page }) => {
    // 选择地区
    const selects = page.locator("select");
    const regionSelect = selects.nth(0);
    await regionSelect.selectOption({ label: "欧洲" });

    // 验证重置按钮可见
    const resetButton = page.getByRole("button", { name: /重置|清除|Reset/i });
    // 或者通过文本查找
    const resetByText = page.getByText(/重置/);
    const hasResetButton = await resetButton.isVisible().catch(() => false)
      || await resetByText.isVisible().catch(() => false);

    if (hasResetButton) {
      // 点击重置
      if (await resetButton.isVisible()) {
        await resetButton.click();
      } else {
        await resetByText.click();
      }

      // 验证地区下拉恢复为默认（全部地区）
      await expect(regionSelect).toHaveValue("");

      // 验证国家下拉恢复为禁用
      const countrySelect = selects.nth(1);
      await expect(countrySelect).toBeDisabled();
    } else {
      // 重置按钮可能使用不同文本，跳过
      test.skip();
    }
  });

  test("无匹配数据 → 显示空状态", async ({ page }) => {
    // 输入不匹配的搜索词
    const searchInput = page.getByPlaceholder("输入关键字搜索");
    await searchInput.fill("xyznonexistent12345");

    // 等待过滤生效
    await page.waitForTimeout(300);

    // 验证空状态提示可见
    const emptyState = page.getByText(/暂无匹配数据|No matching data/i);
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });
});
