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

/** 服务表行（findPublicDetail 真实列口径的最小集） */
function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    notice_pk: 1786635783,
    notice_id: "N-1",
    source_url: "https://eis.gov.lv/notice/1",
    reference: "VNĪ 2026/2-17/AK-66",
    title: "Purchasing and assembly of ASSA Abloy lathe machinery",
    notice_type_code: "ITB",
    country_code: "LV",
    buyer_name: "Valsts nekustamie īpašumi",
    buyer_group: "AGENCY_LV",
    platform_name: "eis.gov.lv",
    deadline_ts: 1794902400,
    published_ts: 1792195200,
    estimated_value: "0.00",
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

  it("带 locale：预热机构快照 → 走列表同一条链 → 改名为 agencyI18n 下发", async () => {
    const body = await callDetail("zh");

    expect(ensureAgencyI18nWarmup).toHaveBeenCalledTimes(1);
    expect(enrichAgencyI18n).toHaveBeenCalledTimes(1);
    expect(body.agencyI18n).toBe("拉脱维亚房地产局");
    // 行上的列名属存储层，不外露（命名红线②）
    expect(body).not.toHaveProperty("agency_i18n");
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
});
