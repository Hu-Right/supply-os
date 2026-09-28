/**
 * 高级搜索升级门控冒烟（访客）
 * - 访客把关键词 chip 点成「排除」（包含 → 排除）→ 弹升级引导框（取代旧「降级横幅」）
 * - 默认「包含」chip → 不弹框
 * 说明：门控判定源自服务端 gates（/api/membership/status），访客按 free 口径恒为未授权。
 *      方案 B 后关键词行改为单框 chip 录入：新增 kw-chip-input / kw-chip-{id} /
 *      kw-chip-remove-{id} / kw-chip-count，旧 kw-row-add 与 kw-row-mode 已废弃。
 */
import { test, expect } from "@playwright/test";

test.describe("advanced search upgrade-gate modal (guest)", () => {
  test("guest cycling an include chip to exclude sees upgrade modal", async ({ page }) => {
    await page.goto("/procurement");
    const input = page.getByTestId("kw-chip-input");
    await input.fill("battery");
    await input.press("Enter"); // 生成默认「包含」chip（Enter 不得触发表单提交）

    const chip = page.getByTestId(/^kw-chip-\d+$/);
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal")).toHaveCount(0);

    await chip.click(); // 包含 → 排除：无权益应被拦截
    await expect(page.getByTestId("upgrade-gate-modal")).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal").getByRole("link")).toHaveAttribute("href", "/membership");
  });

  test("guest adding an include chip does not trigger modal", async ({ page }) => {
    await page.goto("/procurement");
    const input = page.getByTestId("kw-chip-input");
    await input.fill("solar panel");
    await input.press("Enter");

    await expect(page.getByTestId(/^kw-chip-\d+$/)).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal")).toHaveCount(0);
    // 计数随 chip 增加
    await expect(page.getByTestId("kw-chip-count")).toContainText("1/");
  });

  test("comma input splits into multiple chips", async ({ page }) => {
    await page.goto("/procurement");
    const input = page.getByTestId("kw-chip-input");
    await input.fill("医疗，建筑"); // 中文逗号切分
    await input.press("Enter");

    await expect(page.getByTestId(/^kw-chip-\d+$/)).toHaveCount(2);
  });
});
