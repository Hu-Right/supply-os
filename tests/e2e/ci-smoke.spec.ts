/**
 * E2E · CI 无数据冒烟套件
 * Data-free CI smoke suite
 *
 * 运行环境：`.github/workflows/ci.yml` 的 e2e job —— 起一个 MySQL 8 service，
 * 只导入 `db/schema/*.sql`（纯 DDL，**不写任何数据**），再起已构建产物跑本文件。
 *
 * 本套件因此只回答三个问题：
 *   1. 结构基线是否真能建出一套**应用可用**的表（能查、不报 Unknown column / 缺表）；
 *   2. 应用在空库上是否能起来、关键页面是否能渲染出静态骨架；
 *   3. 鉴权与参数边界是否仍然明确拒绝（不因为空库而放行或 500）。
 *
 * 本套件**刻意不覆盖**任何依赖业务数据的旅程：套餐卡片与额度、标讯搜索结果、
 * 商机列表与解锁、RFQ 发布与我的、会员状态流转。那些数据的事实源是数据库本身
 * （项目已删除全部种子路径，代码里不造业务数据），因此它们跑本地/内网真库：
 *   npm run build && npm run start      # 另开终端
 *   npx playwright test --project=chromium
 * 覆盖文件为 critical-journeys.spec.ts 与 authenticated-journeys.spec.ts。
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

// ══════════════════════════════════════════════════════════════════════════════
// 1. 结构基线可用：这些端点会真的打到库上，表建坏/列缺失会当场暴露
// ══════════════════════════════════════════════════════════════════════════════

test.describe("结构基线可用（空库可查询）", () => {
  test("公开 RFQ 列表 API → 200 且结构完整（读 crm_bid_notices）", async ({ request }) => {
    const res = await request.get(`${BASE}/api/rfq/list`);
    expect(res.status(), "空库下 RFQ 列表应返回 200 空集，而不是 500").toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test("套餐目录 API → 200 且返回数组（读 crm_plan_catalog）", async ({ request }) => {
    const res = await request.get(`${BASE}/api/membership/plans`);
    expect(res.status(), "空目录应返回 200 空数组，而不是 500").toBe(200);
    const body = await res.json();
    const plans = body.plans ?? body;
    expect(Array.isArray(plans)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. 关键页面骨架：只挑不依赖业务数据也能渲染出来的页面与控件
// ══════════════════════════════════════════════════════════════════════════════

test.describe("关键页面骨架可达", () => {
  // 刻意不含 /membership：其套餐卡片由业务数据驱动，属真库旅程范围
  const pages = ["/", "/procurement", "/supplier", "/learning", "/privacy", "/terms", "/api/system/version"];

  for (const path of pages) {
    test(`${path} → 200`, async ({ request }) => {
      const res = await request.get(`${BASE}${path}`);
      expect(res.status()).toBe(200);
    });
  }

  test("供应商目录：主内容区与筛选控件渲染（静态骨架）", async ({ page }) => {
    await page.goto(`${BASE}/supplier`);
    const main = page.getByRole("main");
    await expect(main).toBeVisible({ timeout: 10_000 });
    await expect(main.getByRole("textbox", { name: /请输入产品/ })).toBeVisible();
    await expect(main.getByRole("button", { name: "搜索供应商" })).toBeVisible();
  });

  test("采购公告页：高级搜索关键词框渲染（静态骨架）", async ({ page }) => {
    await page.goto(`${BASE}/procurement`);
    await expect(
      page.getByRole("textbox", { name: /输入产品、项目、机构、UNSPSC关键词/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. 鉴权与参数边界：空库不得成为放行或 500 的理由
// ══════════════════════════════════════════════════════════════════════════════

test.describe("鉴权与参数边界", () => {
  test("未登录访问商机列表 → 401 + 登录引导", async ({ request }) => {
    const res = await request.get(`${BASE}/api/opportunities?code_id=1`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe(40042);
    expect(body.message).toContain("登录");
  });

  test("未登录访问我的 RFQ → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/rfq/my`);
    expect(res.status()).toBe(401);
  });

  test("未登录访问会员状态 → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/membership/status`);
    expect(res.status()).toBe(401);
  });

  test("坏 token 访问会员状态 → 401 且不泄露堆栈", async ({ request }) => {
    const res = await request.get(`${BASE}/api/membership/status`, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code ?? body.message).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("at ");
  });

  test("不存在的账号登录 → 401 恒时语义（空 crm_users 也不得 500）", async ({ request }) => {
    const ghost = `ci-smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`;
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { identifier: ghost, password: "definitely-wrong-password" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe(40042);
  });

  test("未登录访问解锁端点 → 401（写路径同样先过鉴权）", async ({ request }) => {
    const res = await request.post(`${BASE}/api/opportunities/1/unlock`, {
      data: { unlock_type: "subscription" },
    });
    expect(res.status()).toBe(401);
  });
});
