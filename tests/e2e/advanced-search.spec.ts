/**
 * 高级搜索升级门控冒烟（访客）
 * - 访客把关键词 chip 点成「排除」（包含 → 排除）→ 弹升级引导框（取代旧「降级横幅」）
 * - 默认「包含」chip → 不弹框
 * 说明：门控判定源自服务端 gates（/api/membership/status），访客按 free 口径恒为未授权。
 *      方案 B 后关键词行改为单框 chip 录入：新增 kw-chip-input / kw-chip-{id} /
 *      kw-chip-remove-{id} / kw-chip-count，旧 kw-row-add 与 kw-row-mode 已废弃。
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * 录关键词 chip。
 *
 * 为什么要重试：Next 首屏是 SSR 骨架，React 水合完成前 fill/Enter 不会触发
 * onChange/onKeyDown（草稿被首渲染覆盖，chip 永远不出现）。networkidle 只是
 * 「数据请求停了」，不等于水合完成（dev 下客户端 bundle 编译慢时尤其明显），
 * 因此按「填 → 回车 → 看 chip 数量」轮询，直到水合生效。
 */
async function addChips(page: Page, term: string, expectCount = 1) {
  const input = page.getByTestId("kw-chip-input");
  // 移动端（<md）筛选默认折叠，chip 输入框在折叠区里。水合完成前点击会丢，
  // 因此按「点开 → 看输入框是否可见」重试，而不是点一次就断言。
  await expect(async () => {
    const toggle = page.getByTestId("mobile-filter-toggle");
    if ((await toggle.count()) > 0 && (await toggle.isVisible().catch(() => false))) {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click({ timeout: 5_000 });
    }
    await expect(input).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await expect
    .poll(
      async () => {
        await input.fill(term);
        await input.press("Enter");
        return page.getByTestId(/^kw-chip-\d+$/).count();
      },
      { timeout: 30_000, intervals: [300, 600, 1200, 2000] },
    )
    .toBe(expectCount);
}

test.describe("advanced search upgrade-gate modal (guest)", () => {
  test("guest cycling an include chip to exclude sees upgrade modal", async ({ page }) => {
    await page.goto("/procurement");
    await addChips(page, "battery");

    const chip = page.getByTestId(/^kw-chip-\d+$/).first();
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal")).toHaveCount(0);

    await chip.click(); // 包含 → 排除：无权益应被拦截
    await expect(page.getByTestId("upgrade-gate-modal")).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal").getByRole("link")).toHaveAttribute("href", "/membership");
  });

  test("guest adding an include chip does not trigger modal", async ({ page }) => {
    await page.goto("/procurement");
    await addChips(page, "solar panel");

    await expect(page.getByTestId(/^kw-chip-\d+$/)).toBeVisible();
    await expect(page.getByTestId("upgrade-gate-modal")).toHaveCount(0);
    // 计数随 chip 增加
    await expect(page.getByTestId("kw-chip-count")).toContainText("1/");
  });

  test("comma input splits into multiple chips", async ({ page }) => {
    await page.goto("/procurement");
    await addChips(page, "医疗，建筑", 2); // 中文逗号切分
  });
});
