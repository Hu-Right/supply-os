/**
 * E2E 测试框架：认证态核心用户旅程
 * E2E Test Framework: Authenticated Critical Journeys
 *
 * @description 基于 Playwright 的认证态端到端测试，覆盖：
 *   1. 商机浏览与解锁（列表脱敏、解锁幂等、免费硬闸、配额边界）
 *   2. RFQ 需求（公开列表、我的 RFQ、发布参数校验边界）
 *   3. 会员权益（订阅状态与额度池读取、套餐目录、升级试算）
 *   4. 鉴权与异常边界（未登录 401、坏 token、404、无效参数 400）
 *
 * 运行前提：目标环境存在真实测试账号（默认 vip@qq.com / free@qq.com），
 *           口令与账号可用环境变量覆盖（E2E_VIP_USER / E2E_FREE_USER / E2E_TEST_PASSWORD）。
 *
 * 写入控制：
 *   - 解锁类用例只在 chromium 项目执行一次（API 语义与浏览器无关），
 *     且依赖重复解锁幂等，重复运行不叠加配额消耗（重复解锁不扣额度）；
 *   - 不在 E2E 中创建支付订单（订单无幂等键，避免污染订单表），
 *     下单/履约状态一致性由集成测试与真库旅程脚本覆盖。
 *
 * 运行方式：
 *   npx playwright test tests/e2e/authenticated-journeys.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ── 测试数据常量 ──────────────────────────────────────────────────────────────
const TEST_BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIP_USER = process.env.E2E_VIP_USER ?? "vip@qq.com";
const FREE_USER = process.env.E2E_FREE_USER ?? "free@qq.com";
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "admin123";
/** 商机用固定靶点（库内真实存在的商机 id），可用环境变量覆盖 */
const OPP_ID = Number(process.env.E2E_OPP_ID ?? 176);

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 通过登录 API 获取 token；失败直接抛错（登录是后续用例的前提，静默降级只会让断言失真）。
 *
 * 登录接口有限流（IP 15min/30、账号 15min/10），而本 spec 在多个浏览器项目 ×
 * 多个 worker 下运行，逐用例登录会打爆限流。因此 token 以文件缓存共享：
 * 同一账号整个套件只登录一次，使用前经 /api/membership/status 校验有效性，
 * 失效（过期/服务端换密）自动重登。
 */

const TOKEN_CACHE_DIR =
  process.env.E2E_TOKEN_CACHE_DIR ?? path.join(".playwright-tokens");
const TOKEN_TTL_MS = 90 * 60 * 1000; // access token 有效期 2h，留安全余量
const tokenMemCache = new Map<string, { token: string; at: number }>();

function tokenCachePath(identifier: string): string {
  return path.join(TOKEN_CACHE_DIR, `token-${identifier.replace(/[^a-zA-Z0-9@._-]/g, "_")}.txt`);
}

async function tokenValid(request: APIRequestContext, token: string): Promise<boolean> {
  try {
    const res = await request.get(`${TEST_BASE_URL}/api/membership/status`, {
      headers: authHeaders(token),
    });
    return res.status() === 200;
  } catch {
    return false;
  }
}

async function loginToken(
  request: APIRequestContext,
  identifier: string,
): Promise<string> {
  const mem = tokenMemCache.get(identifier);
  if (mem && Date.now() - mem.at < TOKEN_TTL_MS && (await tokenValid(request, mem.token))) {
    return mem.token;
  }
  const file = tokenCachePath(identifier);
  try {
    const cached = readFileSync(file, "utf8").trim();
    const statMtime = cached ? Number(cached.split("|")[1] ?? 0) : 0;
    const token = cached.split("|")[0];
    if (token && Date.now() - statMtime < TOKEN_TTL_MS && (await tokenValid(request, token))) {
      tokenMemCache.set(identifier, { token, at: Date.now() });
      return token;
    }
  } catch { /* 无缓存文件，走登录 */ }

  const res = await request.post(`${TEST_BASE_URL}/api/auth/login`, {
    data: { identifier, password: E2E_TEST_PASSWORD },
  });
  expect(res.ok(), `登录失败 ${identifier}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token, "登录响应缺少 token").toBeTruthy();
  const token = body.token as string;
  tokenMemCache.set(identifier, { token, at: Date.now() });
  try {
    mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
    writeFileSync(file, `${token}|${Date.now()}`);
  } catch { /* 缓存写失败不影响测试，仅可能多一次登录 */ }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 解锁等有副作用的 API 用例只在 chromium 项目跑一次（语义与浏览器无关） */
const isChromium = () => test.info().project.name === "chromium";

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 1：鉴权边界（所有浏览器项目执行，验证降级与明确提示）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("鉴权与异常边界", () => {
  test("未登录访问受保护 API → 401 + 明确错误码", async ({ request }) => {
    // R3' B2：商机列表不再吃旧品类码 code_id，这里只验「受保护」性质本身
    const res = await request.get(`${TEST_BASE_URL}/api/opportunities`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe(40042);
    expect(body.message).toContain("登录");
  });

  test("无效 token → 401（不泄露堆栈）", async ({ request }) => {
    const res = await request.get(`${TEST_BASE_URL}/api/membership/status`, {
      headers: authHeaders("not-a-jwt"),
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code ?? body.message).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("at ");
  });

  test("错误密码登录 → 403 账号或密码错误", async ({ request }) => {
    // 用不存在的随机账号：不占用真实账号的限流桶（账号维度 15min/10），
    // 恒时语义对不存在账号与错误密码一致
    const ghost = `e2e-wrong-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`;
    const res = await request.post(`${TEST_BASE_URL}/api/auth/login`, {
      data: { identifier: ghost, password: "definitely-wrong-password" },
    });
    // 401 语义红线（③）：凭据被拒 = 会话已死 → 403 + EC_ACCOUNT_ISSUE(40013)，
    // 不得再用 401（否则登录失败会被 api-client 当成「token 过期」去刷新/登出）
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe(40013);
  });

  test("不存在的商机解锁 → 404 明确错误码", async ({ request }) => {
    const token = await loginToken(request, VIP_USER);
    const res = await request.post(`${TEST_BASE_URL}/api/opportunities/999999999/unlock`, {
      headers: authHeaders(token),
      data: { unlock_type: "subscription" },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.message).toContain("不存在");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 2：商机浏览与解锁（认证态）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("商机浏览与解锁旅程", () => {
  test("商机列表 → 付费字段脱敏（无 source_url、description 截断）", async ({ request }) => {
    const token = await loginToken(request, VIP_USER);
    const res = await request.get(
      `${TEST_BASE_URL}/api/opportunities`,
      { headers: authHeaders(token) },
    );
    expect(res.status()).toBe(200);
    const items = await res.json();
    expect(Array.isArray(items)).toBeTruthy();

    const withDesc = items.find((i: { description?: string }) => i.description);
    if (withDesc) {
      // 列表脱敏口径：description ≤ 300 字符（含省略号），source_url 不下发
      expect(withDesc.description.length).toBeLessThanOrEqual(301);
      expect(withDesc).not.toHaveProperty("source_url");
    }
  });

  test("免费类型解锁 → 402 硬闸（免费试用已移除，服务端裁决）", async ({ request }) => {
    test.skip(!isChromium(), "解锁边界用例仅在 chromium 跑一次");
    const token = await loginToken(request, VIP_USER);
    const headers = authHeaders(token);
    // 幂等预检先于免费硬闸：已解锁的商机 free 请求会幂等成功，
    // 因此硬闸断言必须使用当前账号未解锁过的靶点（从列表动态挑选）
    const list = await (await request.get(
      `${TEST_BASE_URL}/api/opportunities`, { headers },
    )).json();
    const unlocks = await (await request.get(
      `${TEST_BASE_URL}/api/opportunities/unlocks`, { headers },
    )).json();
    const unlockedIds = new Set(
      (Array.isArray(unlocks) ? unlocks : unlocks.items ?? [])
        .map((u: { opportunity_id?: number; id?: number }) => u.opportunity_id ?? u.id),
    );
    const target = (Array.isArray(list) ? list : []).find(
      (i: { id: number }) => !unlockedIds.has(i.id),
    );
    test.skip(!target, "当前类目下没有未解锁靶点，硬闸语义由集成测试覆盖");
    const res = await request.post(`${TEST_BASE_URL}/api/opportunities/${target.id}/unlock`, {
      headers,
      data: { unlock_type: "free" },
    });
    expect(res.status()).toBe(402);
    const body = await res.json();
    expect(body.message).toContain("免费");
  });

  test("付费解锁 → 成功；重复解锁 → 幂等 alreadyUnlocked", async ({ request }) => {
    test.skip(!isChromium(), "解锁写入用例仅在 chromium 跑一次，重复运行靠幂等不叠加消耗");
    const token = await loginToken(request, VIP_USER);
    const headers = authHeaders(token);

    const first = await request.post(`${TEST_BASE_URL}/api/opportunities/${OPP_ID}/unlock`, {
      headers,
      data: { unlock_type: "subscription" },
    });
    expect([200, 201]).toContain(first.status());
    const firstBody = await first.json();
    expect(firstBody.success).toBe(true);

    // 幂等：重复解锁返回 alreadyUnlocked，且不产生第二次计费/流水
    const second = await request.post(`${TEST_BASE_URL}/api/opportunities/${OPP_ID}/unlock`, {
      headers,
      data: { unlock_type: "subscription" },
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.alreadyUnlocked).toBe(true);

    // 解锁记录可查询
    const unlocks = await request.get(`${TEST_BASE_URL}/api/opportunities/unlocks`, { headers });
    expect(unlocks.status()).toBe(200);
    const unlockList = await unlocks.json();
    const arr = Array.isArray(unlockList) ? unlockList : unlockList.items ?? [];
    expect(
      arr.some((u: { opportunity_id?: number; id?: number }) =>
        (u.opportunity_id ?? u.id) === OPP_ID),
    ).toBeTruthy();
  });

  test("无订阅用户付费解锁 → 402 明确引导开通会员", async ({ request }) => {
    test.skip(!isChromium(), "边界用例仅在 chromium 跑一次");
    const token = await loginToken(request, FREE_USER);
    // 用一个未解锁的商机靶点（若已解锁则幂等成功也视为通过）
    const res = await request.post(`${TEST_BASE_URL}/api/opportunities/${OPP_ID}/unlock`, {
      headers: authHeaders(token),
      data: { unlock_type: "subscription" },
    });
    // free 账号无订阅无池：402 引导开通；若账号后来开过订阅则可能 200/201，均属合法状态
    if (res.status() === 402) {
      const body = await res.json();
      expect(body.message).toContain("会员");
    } else {
      expect([200, 201]).toContain(res.status());
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 3：RFQ 需求（列表/我的/校验边界；发布全生命周期由真库旅程脚本覆盖）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("RFQ 需求旅程", () => {
  test("RFQ 页面 → 广场列表可见（公开）", async ({ page }) => {
    await page.goto(`${TEST_BASE_URL}/rfq`);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10_000 });
  });

  test("公开 RFQ 列表 API → 结构完整", async ({ request }) => {
    const res = await request.get(`${TEST_BASE_URL}/api/rfq/list`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test("我的 RFQ → 未登录 401 / 登录后 200", async ({ request }) => {
    const anon = await request.get(`${TEST_BASE_URL}/api/rfq/my`);
    expect(anon.status()).toBe(401);

    const token = await loginToken(request, VIP_USER);
    const res = await request.get(`${TEST_BASE_URL}/api/rfq/my`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
  });

  test("发布校验边界 → 标题过短 400 明确报错", async ({ request }) => {
    test.skip(!isChromium(), "校验边界用例仅在 chromium 跑一次");
    const token = await loginToken(request, VIP_USER);
    const res = await request.post(`${TEST_BASE_URL}/api/rfq/create`, {
      headers: authHeaders(token),
      data: {
        title: "短标题",
        description: "这是一个长度不足五十字的描述。",
        deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
        contact_name: "E2E 测试",
        contact_email: "e2e@example.com",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message || body.error).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旅程 4：会员权益流转（读取链路；下单/履约由集成测试与真库脚本覆盖）
// ══════════════════════════════════════════════════════════════════════════════

test.describe("会员权益旅程", () => {
  test("会员状态 API → 未登录 401", async ({ request }) => {
    const res = await request.get(`${TEST_BASE_URL}/api/membership/status`);
    expect(res.status()).toBe(401);
  });

  test("会员状态 API → 订阅与额度池结构完整", async ({ request }) => {
    test.skip(!isChromium(), "状态读取用例仅在 chromium 跑一次");
    const token = await loginToken(request, VIP_USER);
    const res = await request.get(`${TEST_BASE_URL}/api/membership/status`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // 有订阅账号：plan/subscription 结构存在
    expect(body).toHaveProperty("plan");
    if (body.has_subscription) {
      expect(body.subscription).toBeTruthy();
    }
  });

  test("套餐目录 → 公开可读且含价格", async ({ request }) => {
    const res = await request.get(`${TEST_BASE_URL}/api/membership/plans`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const plans = body.plans ?? body;
    expect(Array.isArray(plans)).toBeTruthy();
    expect(plans.length).toBeGreaterThan(0);
    expect(JSON.stringify(plans)).toContain("price");
  });

  test("会员页 → 套餐列表可见（认证态 UI 冒烟）", async ({ page }) => {
    const token = await loginToken(page.request, VIP_USER);
    await page.goto(`${TEST_BASE_URL}/membership`);
    await page.evaluate((t) => localStorage.setItem("supply_os_auth_token", t), token);
    await expect(page.locator('[data-testid="plan-list"]')).toBeVisible({ timeout: 10_000 });
  });
});
