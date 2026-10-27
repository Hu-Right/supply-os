/**
 * GET /api/notices/[id]/preview 路由集成测试（mock 服务表读取）。
 *
 * @description 钉住 2026-10 preview 数据源迁移：从遗留基表 crm_bid_notices
 *              （findDetailPublished）改读服务宽表投影 crm_notice_public（findPublicDetail），
 *              使锁定公告深链详情的机构名 / 国家码走归一 SSOT（如 country_code=LV、
 *              buyer_name 为归一全称），与 /detail、unified-search 同口径。
 *              受 ② 响应字段命名红线约束（"新增不得进入"递减白名单），本路由只返回
 *              已冻结的 6 个 snake 键 + 单词键，绝不新增 published_ts 等 snake 键，
 *              亦绝不吐正文 description（付费墙）。
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
    // 旧基表行：agency_full 未归一、country 非码；若仍走旧源则 buyer_name/country_code 断言失败
    findDetailPublished.mockResolvedValue({
      id: 1786635783, reference: "R", title: "T", notice_type: "ITB", country: "Latvia",
      agency: "RAW", agency_full: "RAW FULL AGENCY", organization: "O",
      deadline_ts: 1794902400, estimated_value: "0.00",
    });

    const body = await callPreview();

    expect(findPublicDetail).toHaveBeenCalledWith(expect.anything(), 1786635783);
    expect(body).toMatchObject({
      notice_pk: 1786635783,
      reference: "VNĪ 2026/2-17/AK-66",
      title: "Purchasing and assembly of ASSA Abloy lathe machinery",
      notice_type_code: "ITB",
      country_code: "LV",
      buyer_name: "Valsts nekustamie īpašumi",
      deadline_ts: 1794902400,
      estimated_value: "0.00",
    });
  });

  it("守付费墙且遵守命名红线：不吐正文、不新增 snake 键", async () => {
    findPublicDetail.mockResolvedValue(serviceRow());
    findDetailPublished.mockResolvedValue({ id: 1, country: "Latvia", agency_full: "X" });

    const body = await callPreview("1");

    // 付费墙：正文/附件绝不外露
    for (const secret of ["description", "description_cn", "contacts", "attachments", "external_links"]) {
      expect(body).not.toHaveProperty(secret);
    }
    // 命名红线（递减白名单"新增不得进入"）：不 mint 未登记的 snake 键
    for (const newKey of ["published_ts", "currency_code", "platform_name", "deadline_type", "deadline_timezone"]) {
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
