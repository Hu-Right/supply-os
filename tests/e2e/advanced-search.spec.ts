/**
 * 高级搜索一期冒烟（访客）
 * - 含高级语法的搜索 → 降级横幅出现
 * - 普通搜索 → 无横幅
 */
import { test, expect } from "@playwright/test";

test.describe("advanced search degraded banner (guest)", () => {
  test("advanced syntax shows degraded banner", async ({ page }) => {
    await page.goto("/procurement?q=solar%20-battery");
    await expect(page.getByTestId("advanced-degraded-banner")).toBeVisible();
    await expect(page.getByTestId("advanced-degraded-banner").getByRole("link")).toHaveAttribute("href", "/membership");
  });

  test("plain query shows no banner", async ({ page }) => {
    await page.goto("/procurement?q=solar");
    await expect(page.getByTestId("advanced-degraded-banner")).toHaveCount(0);
  });
});
