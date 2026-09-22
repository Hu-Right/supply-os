/**
 * E2E 冒烟：移动端布局 + RTL + 「样式是否真的生效」
 *
 * @description 针对「手机内置浏览器（如百度 App）整站无样式」这类回归的自动化防线。
 *              三件事：
 *                1) 全局样式表确实加载并被浏览器应用（用 globals.css 里的纯声明作为探针）；
 *                2) 移动端窄视口下无横向溢出（防止小屏左右滑动）；
 *                3) 阿拉伯语（ar）下 html[dir] 正确切换为 rtl（六语言含 RTL）。
 *
 *              仅在移动端 project 下运行（见 playwright.config.ts 对桌面 project 的 testIgnore）。
 *              说明：Playwright 内置 Chromium 为新版内核，无法直接复现「旧内核丢样式」；
 *              旧内核兼容由构建期 postcss-preset-env 降编译保证，本用例守住的是
 *              「样式表正常加载 + 布局无回归」这条功能基线。
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const HOME = "/showroom";

/** 通过 Cookie 预置语言（middleware 读 supply_os_locale，客户端 LocaleProvider 同步 html lang/dir） */
async function seedLocale(page: import("@playwright/test").Page, locale: string) {
  await page.context().addCookies([
    { name: "supply_os_locale", value: locale, url: BASE_URL },
  ]);
}

test.describe("移动端 · RTL · 样式生效冒烟", () => {
  test.beforeEach(async ({ page }) => {
    // 固定窄视口，保证「无横向溢出」断言在不同 project 下都确定
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("全局样式表已加载并生效（探针：html overflow-x = hidden）", async ({ page }) => {
    await seedLocale(page, "zh");
    await page.goto(`${BASE_URL}${HOME}`, { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(() => {
      // globals.css 里有一条无争议的纯声明： html,body { overflow-x: hidden }
      const overflowX = getComputedStyle(document.documentElement).overflowX;
      // 统计所有可访问样式表里的规则总数，确认 CSS 真正被解析注入
      let ruleCount = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          ruleCount += sheet.cssRules?.length ?? 0;
        } catch {
          /* 跨域样式表读取 cssRules 会抛错，忽略 */
        }
      }
      const linkTags = document.querySelectorAll('link[rel="stylesheet"]').length;
      return { overflowX, ruleCount, linkTags };
    });

    expect(probe.linkTags, "应至少注入一个 <link rel=stylesheet>").toBeGreaterThan(0);
    expect(probe.ruleCount, "样式表规则数过少，疑似 CSS 未生效").toBeGreaterThan(100);
    expect(probe.overflowX, "globals.css 未生效（探针规则缺失）").toBe("hidden");
  });

  test("移动端窄视口无横向溢出", async ({ page }) => {
    await seedLocale(page, "zh");
    await page.goto(`${BASE_URL}${HOME}`, { waitUntil: "networkidle" });

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      // 允许 1px 的舍入误差
      return doc.scrollWidth - window.innerWidth;
    });
    expect(overflow, `页面出现 ${overflow}px 横向溢出`).toBeLessThanOrEqual(1);
  });

  test("阿拉伯语（ar）下正确切换为 RTL", async ({ page }) => {
    await seedLocale(page, "ar");
    await page.goto(`${BASE_URL}${HOME}`, { waitUntil: "domcontentloaded" });

    // dir 由客户端 useEffect 异步写入，等待其收敛为 rtl
    await page.waitForFunction(
      () => document.documentElement.getAttribute("dir") === "rtl",
      undefined,
      { timeout: 10_000 },
    );

    const state = await page.evaluate(() => ({
      dir: document.documentElement.getAttribute("dir"),
      lang: document.documentElement.getAttribute("lang"),
      // RTL 下样式表仍应生效（探针规则不受方向影响）
      overflowX: getComputedStyle(document.documentElement).overflowX,
    }));

    expect(state.dir).toBe("rtl");
    expect(state.lang).toBe("ar");
    expect(state.overflowX).toBe("hidden");
  });
});
