/**
 * E2E 冒烟：移动端布局 + RTL + 「样式是否真的生效」
 *
 * 检查冷加载与刷新资源、关键控件几何布局和真实语言切换。
 * npm run test:e2e:styles 使用真实生产 HTML/CSS/JS、隔离的只读 API 样例。
 * 此套件不连接业务数据库，不替代完整 API E2E 或旧百度内核的真机验收。
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const HOME = "/";
const menuNames = { zh: "打开菜单", ar: "فتح القائمة" };

function watchResources(page: Page) {
  const css = new Set<string>();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`JavaScript: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.url().includes("/_next/static/")) {
      failures.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 500) {
      failures.push(`API 样例缺失或服务异常：${response.status()} ${url.pathname}`);
    }
    if (!url.pathname.startsWith("/_next/static/")) return;
    if (response.status() >= 400) failures.push(`${response.status()} ${url.pathname}`);
    if (url.pathname.endsWith(".css")) {
      const mime = response.headers()["content-type"] ?? "";
      if (!/^text\/css(?:;|$)/i.test(mime)) failures.push(`CSS MIME 错误：${mime} ${url.pathname}`);
      if (response.ok() && /^text\/css(?:;|$)/i.test(mime)) css.add(response.url());
    }
  });
  return { css, failures };
}

async function assertStyles(page: Page, resources: ReturnType<typeof watchResources>) {
  const input = page.getByRole("main").locator('input[type="text"]').first();
  await expect(input).toBeVisible();
  await expect(input).toHaveCSS("border-top-width", "1px");
  await expect(input).toHaveCSS("padding-inline-start", "36px");
  await expect(page.locator("header")).toHaveCSS("position", "sticky");
  const links = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLLinkElement).href));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links)
    expect(resources.css.has(href), `未收到有效 CSS 响应：${href}`).toBe(true);
  expect(resources.failures).toEqual([]);
}

async function assertWithinViewport(locator: Locator) {
  const boxes = await locator.evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      return [{ tag: node.tagName, left: rect.left, right: rect.right, viewport: innerWidth }];
    })
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.left, `${box.tag} 左侧被裁剪`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${box.tag} 右侧被裁剪`).toBeLessThanOrEqual(box.viewport + 1);
  }
}

async function assertInputDirection(page: Page, direction: "ltr" | "rtl") {
  const input = page.getByRole("main").locator('input[type="text"]').first();
  await expect(input).toHaveCSS("direction", direction);
  await expect(input).toHaveCSS(direction === "rtl" ? "padding-right" : "padding-left", "36px");
  const inputBox = await input.boundingBox();
  const iconBox = await input.locator("..").locator("svg").first().boundingBox();
  expect(inputBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  const edgeDistance =
    direction === "rtl"
      ? inputBox!.x + inputBox!.width - iconBox!.x - iconBox!.width
      : iconBox!.x - inputBox!.x;
  expect(edgeDistance).toBeGreaterThanOrEqual(10);
  expect(edgeDistance).toBeLessThanOrEqual(16);
}

test.describe("移动端 · RTL · 样式生效冒烟", () => {
  for (const locale of ["zh", "ar"] as const) {
    test(`${locale}：冷加载及刷新后的 CSS、布局与图标方向`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "supply_os_locale", value: locale, url: baseURL! }]);
      const resources = watchResources(page);
      await page.goto(HOME, { waitUntil: "load" });
      for (const round of ["cold", "reload"]) {
        if (round === "reload") await page.reload({ waitUntil: "load" });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await assertStyles(page, resources);
        await assertInputDirection(page, locale === "ar" ? "rtl" : "ltr");
        const gradient = page.getByRole("main").locator(".bg-gradient-to-r").first();
        await expect(gradient).not.toHaveCSS("background-image", "none");
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await assertWithinViewport(
            page.locator("main input, main select, main button, main h2, header button")
          );
        }
      }
    });
  }

  test("真实菜单切换 zh → ar → zh，文字与输入图标同步镜像", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "supply_os_locale", value: "zh", url: baseURL! }]);
    const resources = watchResources(page);
    await page.goto(HOME, { waitUntil: "load" });
    await page.getByRole("button", { name: menuNames.zh, exact: true }).click();
    for (const locale of ["ar", "zh"] as const) {
      await page
        .getByRole("button", { name: locale === "ar" ? "العربية" : "中文", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await assertInputDirection(page, locale === "ar" ? "rtl" : "ltr");
      const label = page.locator('nav:visible a[href="/procurement"] span.text-start');
      await expect(label).toHaveCSS("text-align", "start");
      await expect(label).toHaveCSS("direction", locale === "ar" ? "rtl" : "ltr");
    }
    expect(resources.failures).toEqual([]);
  });

  test("移除渐变增强分支后，真实回退仍绘制背景", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "load" });
    const removed = await page.evaluate(() => {
      let count = 0;
      function removeEnhancements(group: CSSStyleSheet | CSSGroupingRule) {
        for (let i = group.cssRules.length - 1; i >= 0; i--) {
          const rule = group.cssRules[i];
          if (
            rule instanceof CSSSupportsRule &&
            rule.conditionText.includes("linear-gradient") &&
            rule.conditionText.includes("oklab")
          ) {
            group.deleteRule(i);
            count++;
          } else if (rule instanceof CSSGroupingRule) {
            removeEnhancements(rule);
          }
        }
      }
      for (const sheet of document.styleSheets) {
        if (sheet.href && new URL(sheet.href).origin === location.origin) removeEnhancements(sheet);
      }
      return count;
    });
    expect(removed).toBeGreaterThan(0);
    const gradient = page.getByRole("main").locator(".bg-gradient-to-r").first();
    await expect(gradient).not.toHaveCSS("background-image", "none");
    await expect(gradient).not.toHaveCSS("--tw-gradient-position", /oklab/);
  });

  test("裁剪反例：overflow hidden 不能掩盖超宽控件", async ({ page }) => {
    await page.goto(HOME, { waitUntil: "load" });
    const input = page.getByRole("main").locator('input[type="text"]').first();
    await input.evaluate((element) => {
      element.style.width = "200vw";
    });
    await expect(assertWithinViewport(input)).rejects.toThrow("右侧被裁剪");
  });

  test("资源断言能识别错误的 CSS MIME", async ({ page }) => {
    const resources = watchResources(page);
    await page.route("**/_next/static/**/*.css", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "not CSS" })
    );
    await page.goto(HOME, { waitUntil: "load" });
    expect(resources.css.size).toBe(0);
    expect(resources.failures.some((failure) => failure.includes("CSS MIME 错误"))).toBe(true);
  });

  test("资源断言能识别 CSS 404，防止测试假绿", async ({ page }) => {
    const resources = watchResources(page);
    await page.route("**/_next/static/**/*.css", (route) =>
      route.fulfill({ status: 404, contentType: "text/html", body: "missing CSS" })
    );
    await page.goto(HOME, { waitUntil: "load" });
    expect(resources.css.size).toBe(0);
    expect(resources.failures.some((failure) => failure.includes("404"))).toBe(true);
  });
});
