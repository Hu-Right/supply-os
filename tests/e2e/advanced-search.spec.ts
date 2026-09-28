/**
 * 高级搜索升级门控冒烟（访客）
 * - 访客把关键词行选成「排除/精确短语」→ 弹升级引导框（取代旧「降级横幅」）
 * - 默认「包含」行 → 不弹框
 * 说明：门控判定源自服务端 gates（/api/membership/status），访客按 free 口径恒为未授权。
 */
import { test, expect } from "@playwright/test";

test.describe("advanced search upgrade-gate modal (guest)", () => {
  test("guest selecting exclude mode sees upgrade modal", async ({ page }) => {
    await page.goto("/procurement");
    await page.getByTestId("kw-row-add").click(); // 追加一行（默认 include）
    await page.getByTestId("kw-row-mode").selectOption("exclude"); // 切成排除
    await expect(page.getByTestId("upgrade-gate-modal")).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal").getByRole("link")).toHaveAttribute("href", "/membership");
  });

  test("guest include row does not trigger modal", async ({ page }) => {
    await page.goto("/procurement");
    await page.getByTestId("kw-row-add").click();
    await expect(page.getByTestId("upgrade-gate-modal")).toHaveCount(0);
  });
});
