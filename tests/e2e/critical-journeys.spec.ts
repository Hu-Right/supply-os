/**
 * E2E 测试框架：关键用户旅程
 * E2E Test Framework: Critical User Journeys
 *
 * @description 基于 Playwright 的端到端测试，覆盖核心业务流程。
 *              需要真实运行的应用实例和测试数据库。
 *              CI 中由 e2e.yml 工作流自动执行。
 *
 * 选择器约定：
 *   - 页面识别使用「内容锚点」（标志性 heading/控件）而非 document.title——
 *     全站浏览器标题为统一的 BROWSER_TITLE 三段式品牌标题（src/lib/i18n/metadata.ts），
 *     不携带页面级语义；
 *   - 控件定位使用 role + 可访问名（Playwright 最佳实践），
 *     不依赖 input[type] / data-testid 等实现细节，且不受渲染语言外的属性影响。
 *
 * 运行方式：
 *   npx playwright test --config=playwright.config.ts
 *   npm run test:e2e
 *   npm run test:e2e:ui     # 交互式 UI 模式
 */
import { test, expect, type Page } from "@playwright/test";

// ── 测试数据常量 ──────────────────────────────────────────────────────────────
const TEST_BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIP_USER = "e2e-vip@test.com";
const FREE_USER = "e2e-free@test.com";
// E2E 账号口令来自环境变量（种子账号由 scripts/seed-test-db.ts 创建）
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "test-password";

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 模拟登录（设置 JWT token 到 localStorage） */
async function loginAs(page: Page, identifier: string): Promise<void> {
  // 通过 API 直接获取 token（E2E 测试专用快捷方式）
  // 登录路由 schema 要求 identifier 字段（手机号或邮箱），非 email
  const response = await page.request.post(`${TEST_BASE_URL}/api/auth/login`, {
    data: { identifier, password: E2E_TEST_PASSWORD },
  });
  if (response.ok()) {
    const data = await response.json();
    await page.evaluate(
      ({ token }) => localStorage.setItem("supply_os_auth_token", token),
      { token: data.token },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 1：供应商目录浏览
// ══════════════════════════════════════════════════════════════════════════════

test.describe("供应商目录旅程", () => {
  test("查看供应商列表 → 搜索过滤", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier`);

    // 验证页面加载成功：锁定主内容区（role 语义 + 作用域内断言），
    // 避免命中移动端折叠导航中的隐藏链接、且不受渲染语言影响
    const mainContent = page.getByRole("main");
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    // 验证筛选控件存在（关键词输入框 + 搜索按钮，role 语义定位）
    await expect(
      mainContent.getByRole("textbox", { name: /请输入产品/ }),
    ).toBeVisible();
    await expect(
      mainContent.getByRole("button", { name: "搜索供应商" }),
    ).toBeVisible();
  });

  test("供应商注册入口可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/supplier`);

    // 页面锚点：目录标题
    await expect(
      page.getByRole("heading", { name: "中国及国际供采供应商目录" }),
    ).toBeVisible({ timeout: 10_000 });

    // 注册入口：桌面端 banner 与主内容各有一个（限定 main 作用域避免 strict 冲突）；
    // 移动端导航折叠进抽屉，仅校验主内容区操作按钮存在
    const registerCta = page
      .getByRole("main")
      .getByRole("button", { name: "申请供应商资质评审" });
    if (test.info().project.name.startsWith("mobile")) {
      await expect(page.getByRole("main").getByRole("button").first()).toBeVisible();
    } else {
      await expect(registerCta).toBeVisible();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 2：公采资质测试
// ══════════════════════════════════════════════════════════════════════════════

test.describe("公采资质旅程", () => {
  test("查看资质测试页面", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/procurement/qualification`);
    // 页面锚点：资质诊断表单标题
    await expect(
      page.getByRole("heading", { name: "企业全球采购机会诊断" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 3：投标流程（搜索 → 查看）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("投标流程旅程", () => {
  test("搜索公告 → 查看结果列表", async ({ page }) => {
    // Step 1: 进入采购公告搜索（高级搜索面板，ADVANCED_SEARCH 已上线）
    await page.goto(`${TEST_BASE_URL}/procurement`);
    const keywordInput = page.getByRole("textbox", {
      name: /输入产品、项目、机构、UNSPSC关键词/,
    });
    await expect(keywordInput).toBeVisible({ timeout: 10_000 });

    // Step 2: 输入搜索关键词并触发搜索
    await keywordInput.fill("construction");
    await page.getByRole("button", { name: "搜索", exact: true }).click();

    // Step 3: 结果列表有内容（卡片以 level-4 标题呈现）
    await expect(
      page.getByRole("heading", { level: 4 }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("搜索结果 → 公告卡片可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/procurement`);

    // 等待高级搜索面板与结果列表加载（公告卡片以 level-4 标题呈现）
    await expect(
      page.getByRole("textbox", { name: /输入产品、项目、机构、UNSPSC关键词/ }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 4 }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 4：会员购买流程
// ══════════════════════════════════════════════════════════════════════════════

test.describe("会员购买旅程", () => {
  test("查看会员页面 → 套餐列表可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/membership`);

    // 验证套餐列表可见
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible({ timeout: 10_000 });

    // 验证至少一个套餐卡片可见
    const planCard = page.locator('[data-testid="plan-card"]').first();
    await expect(planCard).toBeVisible({ timeout: 5_000 });
  });

  test("套餐卡片 → 价格和功能展示", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/membership`);

    // 等待套餐列表加载
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible({ timeout: 10_000 });

    // 验证套餐卡片包含价格信息
    const planCard = page.locator('[data-testid="plan-card"]').first();
    await expect(planCard).toContainText("¥");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 5：学习中心
// ══════════════════════════════════════════════════════════════════════════════

test.describe("学习中心旅程", () => {
  test("查看学习中心页面 → 资料列表可见", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/learning`);

    // 页面锚点：知识中心标题
    await expect(
      page.getByRole("heading", { name: "常采公采知识培训中心" }),
    ).toBeVisible({ timeout: 10_000 });

    // 验证页面内容加载（学习资料区域）
    await expect(page.locator("h3").first()).toBeVisible({ timeout: 10_000 });
  });

  test("学习中心 → 资料卡片展示", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/learning`);

    // 页面锚点：学习区标题 + 资料区域
    await expect(
      page.getByRole("heading", { name: "联合国采购与国际投标学习区" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h3").first()).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 冒烟测试：关键页面可达
// ══════════════════════════════════════════════════════════════════════════════

test.describe("冒烟测试", () => {
  const criticalPages = [
    { name: "首页", path: "/" },
    { name: "采购公告", path: "/procurement" },
    { name: "供应商", path: "/supplier" },
    { name: "会员", path: "/membership" },
    { name: "培训", path: "/learning" },
    { name: "隐私政策", path: "/privacy" },
    { name: "用户协议", path: "/terms" },
    { name: "API 健康检查", path: "/api/system/version" },
  ];

  for (const { name, path } of criticalPages) {
    test(`${name} (${path}) → 200`, async ({ request }) => {
      const response = await request.get(`${TEST_BASE_URL}${path}`);
      expect(response.status()).toBe(200);
    });
  }
});
