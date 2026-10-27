/**
 * GET /api/notices/[id]/preview 路由集成测试（mock 服务表读取）。
 *
 * @description 钉住 2026-10 preview 数据源迁移：从遗留基表 crm_bid_notices
 *              （findDetailPublished）改读服务宽表投影 crm_notice_public（findPublicDetail），
 *              使锁定公告深链详情的机构名 / 国家码走归一 SSOT（如 country_code=LV、
 *              buyer_name 为归一全称），与 /detail、unified-search 同口径。
 *              受 ② 响应字段命名红线约束，本路由只返回已登记的 8 个键（camelCase）+ 单词键；
 *              未登记的列（如 publishedTs 等宽表列）与正文 description（付费墙）均不对外。
 *              注：本路由故意不用行→视图 mapper（mapper 只改名不裁剪），因此这里的键名
 *              由路由显式控制；serviceRow() 仍是 snake，它模拟的是 DB 行而不是响应。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 新数据源：服务宽表投影
const findPublicDetail = vi.fn();
vi.mock("@/lib/services/notice-public/read", () => ({ findPublicDetail }));

// 过渡期同时提供旧的 detailRepo：未迁移时当前代码仍走旧源 → 归一字段断言失败（RED 而非崩溃）
const findDetailPublished = vi.fn();
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ dbPool: {}, notice: { detailRepo: { findDetailPublished } } }),
}));

async function callPreview(id = "1786635783"): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/notices/[id]/preview/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/notices/${id}/preview`), {
    params: Promise.resolve({ id }),
  });
  return (await res.json()) as Record<string, unknown>;
}

/** 服务宽表行（findPublicDetail 真实列口径），含付费正文字段用于验证被剔除 */
function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    notice_pk: 1786635783,
    reference: "VNĪ 2026/2-17/AK-66",
    title: "Purchasing and assembly of ASSA Abloy lathe machinery",
    notice_type_code: "ITB",
    country_code: "LV",
    buyer_name: "Valsts nekustamie īpašumi",
    deadline_ts: 1794902400,
    estimated_value: "0.00",
    published_ts: 1792195200,
    currency_code: "EUR",
    platform_name: "eis.gov.lv",
    description: "PAYWALLED FULL BODY",
    description_cn: "付费正文",
    contacts: [{ a: 1 }],
    attachments: [{ b: 2 }],
    external_links: [{ c: 3 }],
    ...overrides,
  };
}

describe("GET /api/notices/[id]/preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("改读服务宽表投影：机构/国家走归一 SSOT 值", async () => {
    findPublicDetail.mockResolvedValue(serviceRow());
    // 旧基表行：agency_full 未归一、country 非码；若仍走旧源则 buyerName/countryCode 断言失败
    findDetailPublished.mockResolvedValue({
      id: 1786635783, reference: "R", title: "T", notice_type: "ITB", country: "Latvia",
      agency: "RAW", agency_full: "RAW FULL AGENCY", organization: "O",
      deadline_ts: 1794902400, estimated_value: "0.00",
    });

    const body = await callPreview();

    expect(findPublicDetail).toHaveBeenCalledWith(expect.anything(), 1786635783);
    expect(body).toMatchObject({
      noticePk: 1786635783,
      reference: "VNĪ 2026/2-17/AK-66",
      title: "Purchasing and assembly of ASSA Abloy lathe machinery",
      noticeTypeCode: "ITB",
      countryCode: "LV",
      buyerName: "Valsts nekustamie īpašumi",
      deadlineTs: 1794902400,
      estimatedValue: "0.00",
    });
  });

  it("守付费墙且遵守命名红线：不吐正文、不新增 snake 键", async () => {
    findPublicDetail.mockResolvedValue(serviceRow());
    findDetailPublished.mockResolvedValue({ id: 1, country: "Latvia", agency_full: "X" });

    const body = await callPreview("1");

    // 付费墙：正文/附件绝不外露
    for (const secret of ["description", "descriptionCn", "contacts", "attachments", "externalLinks"]) {
      expect(body).not.toHaveProperty(secret);
    }
    // 命名红线：未登记的列不得出现在响应上（camel 与 snake 两面都钉住，
    // 防的是将来改用整行 mapper 时把付费墙以外的列一并带出）
    for (const newKey of ["publishedTs", "currencyCode", "platformName", "deadlineType", "deadlineTimezone",
      "published_ts", "currency_code", "platform_name", "deadline_type", "deadline_timezone"]) {
      expect(body).not.toHaveProperty(newKey);
    }
    // 基表历史列名不再外露（统一走宽表名）
    for (const stale of ["country", "notice_type", "deadline", "agency", "agency_full"]) {
      expect(body).not.toHaveProperty(stale);
    }
  });

  it("服务表查无（未同步/不存在）→ 404", async () => {
    findPublicDetail.mockResolvedValue(null);
    findDetailPublished.mockResolvedValue(null);
    const { GET } = await import("@/app/api/notices/[id]/preview/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/notices/999/preview"), {
      params: Promise.resolve({ id: "999" }),
    });
    expect(res.status).toBe(404);
  });
});
