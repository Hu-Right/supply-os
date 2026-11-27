/**
 * 采购需求发布链端到端（全案七步流程 1→6 步 + 撤回）
 *
 * @module tests/e2e/procurement-publish-chain
 * @description 覆盖：采购方认证（执照上传→PUT buyer→HMAC 核验回调）→ 需求创建/填写/
 *              明细整包 → 提交（资格前置 + 自动初审）→ 授权书（GET letterHash → 扫描件
 *              签署上传 → HMAC 授权核验）→ 评审回调 approved（发布闸五项）→ published
 *              → 公开面断言（广场卡片核验徽章 + 公开详情徽章，即 859928d4 的三态展示）
 *              → 撤回 → 投影清理断言。
 *
 * ⚠ 环境要求：
 *  - BASE_URL 必须指向连云库的生产 standalone（本机 dev 水合已坏，勿用）；
 *  - 写入的是真库：所有数据以【E2E】打标，用例收尾撤回到 draft（投影清理由服务保证）；
 *  - RFQ_REVIEW_CALLBACK_SECRET 必须注入进程（HMAC 回调签名用），跑法：
 *      RFQ_REVIEW_CALLBACK_SECRET=… BASE_URL=http://127.0.0.1:3100 \
 *      npx playwright test tests/e2e/procurement-publish-chain.spec.ts --project=chromium
 *  - 账号用 free@qq.com（无既有采购主体，走全新认证链；vip 的既有 buyer 不碰）。
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const IDENTIFIER = process.env.E2E_FREE_USER ?? "free@qq.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "admin123";
const SECRET = process.env.RFQ_REVIEW_CALLBACK_SECRET ?? "";

const TAG = "【E2E】";
/** 每次运行的唯一后缀：避免重复性机判/历史数据混淆 */
const RUN = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 12);
const ORG_NAME = `${TAG}测试采购主体${RUN}`;
const PROJECT_TITLE = `${TAG}测试采购学生课桌椅${RUN}`;

/** 1×1 透明 PNG（执照/扫描件占位，满足格式白名单即可） */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// ── 登录与 HMAC ───────────────────────────────────────────────────────────────

let cachedToken = "";

async function login(request: APIRequestContext): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { identifier: IDENTIFIER, password: PASSWORD },
  });
  expect(res.ok(), `登录失败 ${IDENTIFIER}: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token, "登录响应缺少 token").toBeTruthy();
  cachedToken = body.token as string;
  return cachedToken;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 服务间 HMAC 回调（与 src/lib/services/procurement/callback-auth.ts 同算法） */
async function hmacCallback(
  request: APIRequestContext,
  route: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  test.skip(!SECRET, "RFQ_REVIEW_CALLBACK_SECRET 未注入，跳过 HMAC 回调用例");
  const rawBody = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${ts}.${rawBody}`).digest("hex");
  const res = await request.post(`${BASE}${route}`, {
    headers: {
      "content-type": "application/json",
      "x-review-timestamp": String(ts),
      "x-review-signature": sig,
      "x-review-request-id": randomUUID(),
    },
    data: rawBody,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* 非 JSON 响应（错误页等） */
  }
  return { status: res.status(), json };
}

// ── 用例 ──────────────────────────────────────────────────────────────────────

test.describe.serial("采购需求发布链", () => {
  // 全链含文件上传、自动初审（LLM）与多次写库，默认 30s 不够；串行执行避免项目间互撞
  test.setTimeout(180_000);

  let buyerId = 0;
  let projectId = 0;
  let versionNo = 1;

  test("第1步 采购方认证：执照上传 → 建主体 → HMAC 核验通过", async ({ request }) => {
    const token = await login(request);

    // 执照上传（multipart，单一路径）
    const upRes = await request.post(`${BASE}/api/procurement/buyer/license-upload`, {
      headers: authHeaders(token),
      multipart: {
        file: { name: "license.png", mimeType: "image/png", buffer: TINY_PNG },
      },
    });
    expect(upRes.ok(), `执照上传失败: ${upRes.status()} ${await upRes.text()}`).toBeTruthy();
    const up = (await upRes.json()) as { url?: string; fileHash?: string };
    // url = /api/user/enterprise/license/<filename>；buyer.license_file_key 存文件名
    const licenseKey = (up.url ?? "").split("/").pop();
    expect(licenseKey, "执照上传响应缺少 url/key").toBeTruthy();

    // 建主体（PUT buyer，upsert）
    const putRes = await request.put(`${BASE}/api/procurement/buyer`, {
      headers: { ...authHeaders(token), "content-type": "application/json" },
      data: {
        orgName: ORG_NAME,
        buyerRole: "government",
        country: "中国",
        countryCode: "CN",
        regNo: `91330106E2E${RUN.slice(-6)}X`,
        officialEmail: IDENTIFIER,
        officialPhone: "16768233298",
        licenseFileKey: licenseKey,
        authContactName: "E2E联系人",
        authContactPhone: "16768233298",
        authContactEmail: IDENTIFIER,
      },
    });
    expect(putRes.ok(), `建主体失败: ${putRes.status()} ${await putRes.text()}`).toBeTruthy();
    const put = (await putRes.json()) as { buyer?: { id?: number }; buyerId?: number };
    buyerId = put.buyer?.id ?? put.buyerId ?? 0;
    expect(buyerId, "建主体响应缺少 buyerId").toBeTruthy();

    // HMAC 核验回调（identity pass）
    const cb = await hmacCallback(request, "/api/procurement/buyer/verify-callback", {
      buyerId,
      kind: "identity",
      result: "pass",
      reviewer: "e2e",
      note: "E2E 自动核验",
    });
    expect(cb.status, `买家核验回调失败: ${JSON.stringify(cb.json)}`).toBe(200);

    // 断言主体已核验
    const getRes = await request.get(`${BASE}/api/procurement/buyer`, { headers: authHeaders(token) });
    expect(getRes.ok()).toBeTruthy();
    const buyer = (await getRes.json()) as { buyer?: { status?: string; id?: number } };
    expect(buyer.buyer?.status ?? "").toBe("verified");
  });

  test("第2-3步 需求创建/填写/明细 → 提交（自动初审通过）", async ({ request }) => {
    const token = await login(request);

    const createRes = await request.post(`${BASE}/api/procurement/projects`, {
      headers: authHeaders(token),
      data: {},
    });
    expect(createRes.ok(), `创建项目失败: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const created = (await createRes.json()) as { id?: number; reference?: string };
    projectId = created.id ?? 0;
    expect(projectId).toBeTruthy();

    // 填写主表（提交必填集：title/purpose/object_types/category/delivery_city/quote_deadline/authorize_publish）
    const deadline = Math.floor(Date.now() / 1000) + 8 * 24 * 3600;
    const patchRes = await request.patch(`${BASE}/api/procurement/projects/${projectId}`, {
      headers: { ...authHeaders(token), "content-type": "application/json" },
      data: {
        titleZh: PROJECT_TITLE,
        titleEn: `${TAG}E2E School Desks and Chairs ${RUN}`,
        purpose: "real",
        objectTypes: ["goods"],
        primaryUgtCode: "UGT-1504010113",
        deliveryCountry: "肯尼亚",
        deliveryCountryCode: "KE",
        deliveryCity: "内罗毕",
        quoteDeadlineAt: deadline,
        authorizePublish: 1,
        contactDisclosure: "org_only",
        budgetPublic: 0,
      },
    });
    expect(patchRes.ok(), `填写主表失败: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy();

    // 明细整包（一条标包 + 一条明细，带独立 UGT 码）——整包替换是 PUT 语义
    const itemsRes = await request.put(`${BASE}/api/procurement/projects/${projectId}/items`, {
      headers: { ...authHeaders(token), "content-type": "application/json" },
      data: {
        lots: [{ lotNo: "LOT-1", title: "课桌椅", scopeNote: "" }],
        items: [
          {
            lotNo: "LOT-1",
            nameZh: "学生课桌椅",
            nameEn: "Student desk and chair set",
            spec: "钢木结构",
            quantity: 500,
            qtyUnit: "套",
            ugtCode: "UGT-1504010113",
            alternativesAllowed: false,
          },
        ],
      },
    });
    expect(itemsRes.ok(), `明细写入失败: ${itemsRes.status()} ${await itemsRes.text()}`).toBeTruthy();

    // 提交（资格前置 + 必填校验 + 自动初审）
    const submitRes = await request.post(`${BASE}/api/procurement/projects/${projectId}/submit`, {
      headers: { ...authHeaders(token), "content-type": "application/json" },
      data: {},
    });
    expect(submitRes.ok(), `提交失败: ${submitRes.status()} ${await submitRes.text()}`).toBeTruthy();
    const submitted = (await submitRes.json()) as { versionNo?: number; status?: string };
    versionNo = submitted.versionNo ?? 1;
    expect(["submitted", "under_review"]).toContain(submitted.status ?? "");

    // 自动初审已跑：requirement_verify 有结论（pass/need_info/risk）
    const detailRes = await request.get(`${BASE}/api/procurement/projects/${projectId}`, {
      headers: authHeaders(token),
    });
    const detail = (await detailRes.json()) as { requirementVerify?: string };
    expect(["pass", "pending", "need_info", "risk"]).toContain(detail.requirementVerify ?? "");
  });

  test("第4-5步 授权书：取 letterHash → 扫描件签署 → HMAC 核验通过", async ({ request }) => {
    const token = await login(request);

    // GET 授权态拿 letterHash（服务端按当前版本计算）
    const getRes = await request.get(`${BASE}/api/procurement/projects/${projectId}/authorization`, {
      headers: authHeaders(token),
    });
    expect(getRes.ok(), `授权态读取失败: ${getRes.status()}`).toBeTruthy();
    const authState = (await getRes.json()) as { letterHash?: string };
    expect(authState.letterHash, "授权态缺少 letterHash").toBeTruthy();

    // 扫描件签署上传（multipart）
    const signRes = await request.post(`${BASE}/api/procurement/projects/${projectId}/authorization`, {
      headers: authHeaders(token),
      multipart: {
        file: { name: "authorization-scan.png", mimeType: "image/png", buffer: TINY_PNG },
        signerName: "E2E签署人",
        letterHash: authState.letterHash as string,
        versionNo: String(versionNo),
      },
    });
    expect(signRes.ok(), `签署上传失败: ${signRes.status()} ${await signRes.text()}`).toBeTruthy();

    // HMAC 授权核验回调
    const cb = await hmacCallback(request, "/api/procurement/authorization-callback", {
      projectId,
      version: versionNo,
      decision: "approved",
      reviewerRef: "e2e",
    });
    expect(cb.status, `授权核验回调失败: ${JSON.stringify(cb.json)}`).toBe(200);
  });

  test("第6步 评审回调 approved → published（发布闸全过）", async ({ request }) => {
    const cb = await hmacCallback(request, "/api/procurement/review-callback", {
      projectId,
      version: versionNo,
      decision: "approved",
      reviewerRef: "e2e",
    });
    expect(cb.status, `评审回调失败: ${JSON.stringify(cb.json)}`).toBe(200);
    const tenderNo = (cb.json.tenderNo ?? (cb.json as { tender?: { tenderNo?: string } }).tender?.tenderNo) as
      | string
      | undefined;
    expect(tenderNo, "发布成功应返回招标编号").toBeTruthy();

    // 详情状态断言
    const detailRes = await request.get(`${BASE}/api/procurement/projects/${projectId}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      status?: string;
      requirementVerify?: string;
      buyerStatus?: string;
    };
    expect(detail.status).toBe("published");
    // 859928d4 三态展示的数据源断言：公开视图必须下发主体/需求两态
    expect(detail.requirementVerify).toBe("pass");
    expect(detail.buyerStatus).toBe("verified");
  });

  test("第7步 公开面：广场含新需求且徽章字段齐备，公开页渲染核验徽章", async ({ page, request }) => {
    // 广场 API：summary 视图带核验字段
    const plazaRes = await request.get(`${BASE}/api/procurement/plaza?page=1`);
    expect(plazaRes.ok()).toBeTruthy();
    const plaza = (await plazaRes.json()) as {
      items?: Array<{ id?: number; titleZh?: string; buyerStatus?: string; requirementVerify?: string }>;
    };
    const hit = (plaza.items ?? []).find((it) => it.id === projectId);
    expect(hit, "广场列表应包含刚发布的需求").toBeTruthy();
    expect(hit?.buyerStatus).toBe("verified");
    expect(hit?.requirementVerify).toBe("pass");

    // 公开详情页（zh 默认）：渲染「主体已核验」「需求核验：已核验」徽章
    await page.goto(`${BASE}/rfq/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("主体已核验", { exact: true })).toBeVisible({ timeout: 15000 });
    // 徽章 span 是「需求核验: 已核验」拼接文本（子串匹配）
    await expect(page.getByText("需求核验: 已核验", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PROJECT_TITLE, { exact: false }).first()).toBeVisible();
  });

  test("撤回 → 投影清理（非 owner 404、广场不可见）", async ({ request }) => {
    const token = await login(request);

    const wdRes = await request.post(`${BASE}/api/procurement/projects/${projectId}/withdraw`, {
      headers: { ...authHeaders(token), "content-type": "application/json" },
      data: { reason: "E2E 用例收尾撤回" },
    });
    expect(wdRes.ok(), `撤回失败: ${wdRes.status()} ${await wdRes.text()}`).toBeTruthy();

    // 非 owner 详情 404（防猜 ID）
    const detailRes = await request.get(`${BASE}/api/procurement/projects/${projectId}`);
    expect(detailRes.status()).toBe(404);

    // 广场不再展示
    const plazaRes = await request.get(`${BASE}/api/procurement/plaza?page=1`);
    const plaza = (await plazaRes.json()) as { items?: Array<{ id?: number }> };
    expect((plaza.items ?? []).some((it) => it.id === projectId)).toBeFalsy();
  });
});

/** 供 CI 产物核对：确保 token 缓存目录存在（复用既有惯例，失败不影响用例） */
export function ensureTokenCacheDir(): string {
  const dir = process.env.E2E_TOKEN_CACHE_DIR ?? path.join(".playwright-tokens");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, ".keep"), "");
  } catch {
    /* ignore */
  }
  return dir;
}

// 保持与既有 spec 一致的默认读取（避免 lint 报未使用）
void readFileSync;
