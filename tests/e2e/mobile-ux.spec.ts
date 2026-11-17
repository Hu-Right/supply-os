/**
 * 移动端 UX 基线（阶段 0 度量固化）
 *
 * 目的：把「移动端专项」的量化目标写成断言，防止后续改动回退。
 * 覆盖（阶段 1 已完成项）：
 *   1. 商机筛选在 <md 默认折叠、可展开；桌面端始终展开
 *   2. 移动端表单控件字号 ≥ 16px（iOS Safari <16px 聚焦会放大整页）
 *   3. 移动端控件高度 ≥ 40px（44px 目标，留 4px 容差）
 *   4. 企业信息编辑表单在 390 宽单列（不得出现多列栅格）
 *   5. 关键页面无文档级横向溢出
 *   6. 商机首条结果位置守卫（阶段 2 压缩首屏后再收紧到 600）
 *
 * 运行：npx playwright test tests/e2e/mobile-ux.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const VIP_USER = process.env.E2E_VIP_USER ?? "vip@qq.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "admin123";
const TOKEN_FILE = path.join(".playwright-tokens", `token-${VIP_USER.replace(/[^a-zA-Z0-9@._-]/g, "_")}.txt`);

/** 复用套件 token 缓存（登录接口限流：IP 15min/30、账号 15min/10，禁止每个用例重登） */
async function loginToken(request: APIRequestContext): Promise<string> {
  try {
    const cached = readFileSync(TOKEN_FILE, "utf8").trim().split("|")[0];
    if (cached) {
      const res = await request.get(`${BASE}/api/membership/status`, { headers: { Authorization: `Bearer ${cached}` } });
      if (res.status() === 200) return cached;
    }
  } catch { /* 无缓存 */ }
  const res = await request.post(`${BASE}/api/auth/login`, { data: { identifier: VIP_USER, password: PASSWORD } });
  expect(res.ok(), `登录失败：${res.status()}`).toBeTruthy();
  const token = (await res.json()).token as string;
  try { mkdirSync(path.dirname(TOKEN_FILE), { recursive: true }); writeFileSync(TOKEN_FILE, `${token}|${Date.now()}`); } catch { /* ignore */ }
  return token;
}

/** 注入完整登录态：仅 token 时，SSR 壳 + 首次 authReady 之前会先渲染游客门禁（"立即登录"），
 *  设置中心这类按登录态分流渲染的页面会断言不到页面内的按钮。故同时注入 auth_user 快照。 */
async function injectSession(page: Page, token: string) {
  const res = await page.request.get(`${BASE}/api/auth/user`, { headers: { Authorization: `Bearer ${token}` } });
  const user = res.ok() ? (await res.json()).user : null;
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem("supply_os_auth_token", t as string);
      if (u) localStorage.setItem("supply_os_auth_user", JSON.stringify(u));
    },
    [token, user] as [string, unknown],
  );
}

/** 就绪信号用「main 可见 + 短暂沉降」，不用 networkidle：
 *  设置中心等页面会持续保活连接，networkidle 可能一直不满足（实测卡满 30s 把用例拖死）。 */
async function gotoReady(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/** 移动端控件字号/高度基线 */
async function expectMobileControlBaseline(page: Page) {
  const offenders = await page.evaluate(() => {
    // 复选框/单选框不算文字控件（字号无意义，44px 由外层 label 承担），不纳入本基线
    const els = [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => !["checkbox", "radio", "hidden"].includes((el as HTMLInputElement).type))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    return els
      .map((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize), h: Math.round(el.getBoundingClientRect().height), ph: el.getAttribute("placeholder") || el.tagName }))
      .filter((x) => x.fs < 16 || x.h < 40);
  });
  expect(offenders, `控件字号<16 或高度<40：${JSON.stringify(offenders)}`).toEqual([]);
}

// dev 首编译慢 + 页面数据请求多，单用例 30s 不够（实测卡在等待态）
test.describe.configure({ timeout: 90_000 });

test.describe("移动端 UX 基线", () => {
  test.beforeEach(() => {
    test.skip(!test.info().project.name.startsWith("mobile"), "仅在移动端项目执行");
  });

  test("商机筛选：<md 默认折叠，点「筛选」展开", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${BASE}/procurement`);

    const toggle = page.getByTestId("mobile-filter-toggle");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    // 折叠态：国家筛选不在视口内（display:none）
    await expect(page.locator("#adv-country")).toBeHidden();
    // 关键词框始终可用
    await expect(page.locator("#adv-keyword")).toBeVisible();

    await toggle.click();
    await expect(page.locator("#adv-country")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("商机筛选折叠后：首条结果前移 + 无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${BASE}/procurement`);
    await expect(page.getByRole("heading", { level: 4 }).first()).toBeVisible({ timeout: 25_000 });

    const m = await page.evaluate(() => {
      const first = document.querySelector("main h4");
      const form = document.querySelector("main form");
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        firstResultTop: first ? Math.round(first.getBoundingClientRect().top + window.scrollY) : null,
        formHeight: form ? Math.round(form.getBoundingClientRect().height) : null,
      };
    });
    expect(m.overflow).toBe(0);
    // 阶段2 目标：首条结果 ≤600px（390/320 实测 580/596）
    expect(m.formHeight!, "筛选面板折叠后应显著变矮").toBeLessThan(320);
    expect(m.firstResultTop!, "首条结果应压进首屏（≤600px）").toBeLessThan(600);
  });

  test("商机页控件：字号 ≥16px、高度 ≥40px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${BASE}/procurement`);
    await page.getByTestId("mobile-filter-toggle").click(); // 展开后覆盖全部控件
    await page.waitForTimeout(400);
    await expectMobileControlBaseline(page);
  });

  test("企业信息编辑表单：390 下单列 + 控件基线", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const token = await loginToken(page.request);
    await injectSession(page, token);
    await gotoReady(page, `${BASE}/settings/enterprise`);

    const edit = page.getByRole("button", { name: /填写企业信息|编辑企业信息|编辑/ }).first();
    await expect(edit).toBeVisible({ timeout: 20_000 });
    await edit.click();
    await page.waitForTimeout(1200);

    // 判定口径：390 宽下不允许出现「非响应式的多列栅格」（grid-cols-2/3/4 必须带 sm:/md: 前缀），
    // 且表单字段行（sm:grid-cols-4）在移动端必须收敛为 1 列。
    // 不用「扫描所有 grid 元素」的口径：能力/证据面板是异步渲染的，扫全页会随加载时机抖动。
    const grids = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll("main [class]")) {
        const cls = typeof el.className === "string" ? el.className : "";
        const bare = cls.split(/\s+/).find((t) => /^grid-cols-[2-9]$/.test(t));
        if (!bare) continue;
        if (getComputedStyle(el).gridTemplateColumns.split(" ").length > 1) bad.push(cls.slice(0, 70));
      }
      const rows = [...document.querySelectorAll("main [class*='sm:grid-cols-4']")]
        .map((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      return { bad, rows };
    });
    expect(grids.bad, `390 宽仍有多列栅格：${JSON.stringify(grids.bad)}`).toEqual([]);
    expect(grids.rows.length, "未找到企业表单字段行").toBeGreaterThan(0);
    expect(Math.max(...grids.rows), "字段行在移动端应为单列").toBe(1);
    await expectMobileControlBaseline(page);
  });

  test("移动端统计块压缩：4 张卡隐藏，改一行摘要", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${BASE}/procurement`);
    // 卡片的副标题「实时库存」属于 4 卡栅格，移动端必须隐藏
    await expect(page.getByText("实时库存").first()).toBeHidden();
    // 摘要行保留可检索数与今日新增
    const summary = await page.evaluate(() => {
      const p = [...document.querySelectorAll("main section p")].find((el) => /今日新增/.test(el.textContent || ""));
      return p ? { visible: p.getBoundingClientRect().height > 0, text: (p.textContent || "").slice(0, 40) } : null;
    });
    expect(summary?.visible, "移动端应有一行规模摘要").toBe(true);
  });

  test("移动端吸底操作条：固定底部，搜索/筛选可用", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${BASE}/procurement`);

    const barToggle = page.getByTestId("mobile-filter-bar-toggle");
    await expect(barToggle).toBeVisible({ timeout: 15_000 });

    const bar = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="mobile-filter-bar-toggle"]')?.parentElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { position: cs.position, bottomGap: Math.round(window.innerHeight - r.bottom), h: Math.round(r.height) };
    });
    expect(bar?.position, "吸底条应为 fixed").toBe("fixed");
    expect(bar!.bottomGap, "吸底条应贴视口底部（含安全区 0）").toBeLessThanOrEqual(2);
    expect(bar!.h).toBeGreaterThanOrEqual(44);

    // 吸底条里的「筛选」与头部开关联动：展开后国家筛选可见
    await barToggle.click();
    await expect(page.locator("#adv-country")).toBeVisible();
    // 品目分类收在折叠区内，展开后可见
    await expect(page.getByRole("button", { name: /品目分类/ })).toBeVisible();
  });

  test("关键页面 320 宽无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const p of ["/", "/procurement", "/membership"]) {
      await gotoReady(page, BASE + p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} 在 320 宽横向溢出 ${overflow}px`).toBe(0);
    }
  });
});

test.describe("桌面端不受移动改动影响", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith("mobile"), "仅在桌面项目执行");
  });

  test("商机筛选在桌面端始终展开、无移动筛选按钮", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReady(page, `${BASE}/procurement`);
    await expect(page.locator("#adv-country")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mobile-filter-toggle")).toBeHidden();
    // 阶段2 的移动端减法不得影响桌面：统计卡与品目分类仍直接可见，且没有吸底条
    await expect(page.getByText("实时库存").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /品目分类/ })).toBeVisible();
    await expect(page.getByTestId("mobile-filter-bar-toggle")).toBeHidden();
  });

  test("企业信息编辑表单在桌面端保持四列布局", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const token = await loginToken(page.request);
    await injectSession(page, token);
    await gotoReady(page, `${BASE}/settings/enterprise`);

    const edit = page.getByRole("button", { name: /填写企业信息|编辑企业信息|编辑/ }).first();
    await expect(edit).toBeVisible({ timeout: 20_000 });
    await edit.click();
    await page.waitForTimeout(1200);

    const fourCol = await page.evaluate(() =>
      [...document.querySelectorAll("[class*='sm:grid-cols-4']")]
        .filter((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 4).length,
    );
    expect(fourCol, "桌面端字段区应仍为 4 列").toBeGreaterThan(0);
  });
});