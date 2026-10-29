/**
 * GET /api/notices/[id]/detail 的机构名接线（统一中文 2026-10-28）。
 *
 * @description 详情是「整行过 view mapper」的出口，静态门禁看不见键名，所以接线必须由断言钉住：
 *              1) 带 locale 时先预热机构快照，再走列表同一条回退链补 `agency_i18n`；
 *              2) 该列经 mapper 改名为 camel `agencyI18n` 对外，snake 列名不外露；
 *              3) 来源平台只在解锁后的详情下发（列表/预览一律不下发，2026-10-28 用户口径）。
 *              回退链自身的取词口径（精确解析优先 / 聚合回退 / zh 终兜底）由
 *              tests/unit/lib/services/search-orchestrator/format.agency-i18n.test.ts 钉住，
 *              本文件只验路由有没有把它接上——故把 format 整体 mock 成可控写入。
 *              全程假 repo，不连库。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findPublicDetail, findUnlock, enrichAgencyI18n, ensureAgencyI18nWarmup } = vi.hoisted(() => ({
  findPublicDetail: vi.fn(),
  findUnlock: vi.fn(),
  // 列表链路的真实取词不在射程内：这里固定写一个译名，只验「有没有被接上 + 有没有改名」
  enrichAgencyI18n: vi.fn((items: Array<Record<string, unknown>>) => {
    for (const item of items) item.agency_i18n = "拉脱维亚房地产局";
    return items;
  }),
  ensureAgencyI18nWarmup: vi.fn(async () => undefined),
}));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn(async () => ({ userId: 7, authViaJwt: true })),
}));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    dbPool: {},
    benefitSystemRepo: {},
    notice: { unlockRepo: { findUnlock } },
  }),
}));
vi.mock("@/lib/services/industry-scope", () => ({ canAccessNotice: vi.fn(async () => true) }));
vi.mock("@/lib/services/notices", () => ({ findQualifiedOpportunityForNotice: vi.fn(async () => null) }));
vi.mock("@/lib/services/notice-public/read", () => ({ findPublicDetail }));
vi.mock("@/lib/services/platform/alias-store", async (importOriginal) => ({
  // 只换掉取数入口，normalizePlatformKey / hostOf 保持真实（resolvePlatform 靠它们解析空快照）
  ...(await importOriginal<typeof import("@/lib/services/platform/alias-store")>()),
  loadPlatformAliasSnapshot: vi.fn(async () => ({
    byKey: new Map(), byHost: new Map(), formsByCanonical: new Map(),
  })),
}));
vi.mock("@/lib/services/search-orchestrator/format", () => ({ enrichAgencyI18n, ensureAgencyI18nWarmup }));

/** 服务表行：按 findPublicDetail 的真实 SELECT 列全量给值（下面那条「无 snake 键」
 *  不变量只有覆盖全部列才有意义——只放几个列就会漏住 mapper 认不到的那些） */
function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    notice_pk: 1786635783,
    notice_id: "N-1",
    source_url: "https://eis.gov.lv/notice/1",
    reference: "VNĪ 2026/2-17/AK-66",
    title: "Purchasing and assembly of ASSA Abloy lathe machinery",
    description: "Body",
    description_cn: "中文描述",
    content_level: 2,
    industry: "Construction",
    published_ts: 1792195200,
    deadline_ts: 1794902400,
    deadline_state: "open",
    deadline_type: "fixed",
    deadline_timezone: "Europe/Riga",
    country_code: "LV",
    country_codes: "LV",
    notice_type_code: "ITB",
    platform_name: "eis.gov.lv",
    buyer_name: "Valsts nekustamie īpašumi",
    buyer_group: "AGENCY_LV",
    estimated_value: "0.00",
    currency_code: "EUR",
    currency_source: "notice",
    contacts: [{ name: "A" }],
    attachments: [{ fileName: "a.pdf" }],
    external_links: [{ title: "t", url: "u" }],
    difficulty: null,
    registration_level: null,
    beneficiary_countries: "LV",
    updated_at: "2026-10-28 09:00:00",
    is_opportunity: 1,
    timezone_source: "EET",
    ...overrides,
  };
}

async function callDetail(locale?: string): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/notices/[id]/detail/route");
  const url = `http://localhost:3000/api/notices/1786635783/detail${locale ? `?locale=${locale}` : ""}`;
  const res = await GET(new NextRequest(url), { params: Promise.resolve({ id: "1786635783" }) });
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/notices/[id]/detail 的机构名接线", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findPublicDetail.mockResolvedValue(serviceRow());
    findUnlock.mockResolvedValue({ unlock_type: "quota", unlocked_at: 1 });
  });

  it("带 locale：预热机构快照 → 只接精确解析层 → 改名为 agencyI18n 下发", async () => {
    const body = await callDetail("zh");

    expect(ensureAgencyI18nWarmup).toHaveBeenCalledTimes(1);
    expect(enrichAgencyI18n).toHaveBeenCalledTimes(1);
    // 详情不得接列表侧的国家级聚合桶（「法国各机构」会盖掉真实买家名）
    expect(enrichAgencyI18n).toHaveBeenCalledWith([expect.any(Object)], "zh", { preciseOnly: true });
    expect(body.agencyI18n).toBe("拉脱维亚房地产局");
    // 行上的列名属存储层，不外露（命名红线②）
    expect(body).not.toHaveProperty("agency_i18n");
  });

  it("无精名：显式下发空串而不是缺键（不让 /preview 的聚合名在解锁后残留）", async () => {
    // 前端解锁合并是 {...preview, ...detail}：detail 缺 agencyI18n 键时，
    // 锁定态预览里那份「法国各机构」会继续盖住真名，所以空串必须下发。
    enrichAgencyI18n.mockImplementationOnce((items) => items);
    const body = await callDetail("zh");

    expect(body.agencyI18n).toBe("");
    expect(body.buyerName).toBe("Valsts nekustamie īpašumi");
  });

  it("不带 locale：不预热、不翻译（老客户端不传参也不报错）", async () => {
    const body = await callDetail();

    expect(ensureAgencyI18nWarmup).not.toHaveBeenCalled();
    expect(enrichAgencyI18n).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("agencyI18n");
    // 买家原名仍在（前端回退链 agencyI18n → buyerName）
    expect(body.buyerName).toBe("Valsts nekustamie īpašumi");
  });

  it("来源平台只由详情下发（列表与 /preview 均不下发）", async () => {
    const body = await callDetail("zh");

    // 未命中别名表 → 回落服务表 platform_name（域名兜底），code/zh 置空
    expect(body.platform).toEqual({ canonical: "eis.gov.lv", code: null, zh: "" });
  });

  it("来源口径收口：死字段 platformName 不再下发，sourceUrl 保留（确有消费方）", async () => {
    const body = await callDetail("zh");

    // 行上的 platform_name 会被 mapper 改名成 platformName，但全仓无人读它（引用核查 2026-10-29）——
    // 详情的来源平台只由 platform 对象承载，与列表侧 delete platform_name 同规格
    expect(body).not.toHaveProperty("platformName");
    expect(body).not.toHaveProperty("platform_name");
    expect(body.platform).toBeTruthy();
    // 解锁后的原文外链有真实消费方（FilesTab / DetailHeader / NoticeUnlockedDetails），必须保留
    expect(body.sourceUrl).toBe("https://eis.gov.lv/notice/1");
  });

  it("红线②不变量：详情载荷顶层不得出现含下划线的键（整行过 mapper 后必须全 camel）", async () => {
    // 不钉具体键集合（服务表加列就会误红），只钉「改名不能漏」这条不变量：
    // toNoticeView 是改名不裁剪，任何带下划线的列名都不应出现在对外契约里。
    const body = await callDetail("zh");
    const offenders = Object.keys(body).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));
    expect(offenders).toEqual([]);
  });
});
