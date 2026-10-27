/**
 * GET /api/notices/[id]/preview 路由集成测试（mock getContext）。
 *
 * @description 复现并锁定 2026-10 详情页深链空白缺陷：preview 曾原样吐基表历史列名
 *              （country / notice_type / deadline / agency），而消费方 NoticeDetail
 *              读的是服务宽表列（country_code / notice_type_code / deadline_ts / buyer_name），
 *              名字对不上 → 锁定公告深链进入详情时回落"未知机构/全球/暂无截止/0.00"。
 *              本测试钉住 preview 输出必须对齐宽表口径。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findDetailPublished = vi.fn();
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ notice: { detailRepo: { findDetailPublished } } }),
}));

async function callPreview(id = "1786635783"): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/notices/[id]/preview/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/notices/${id}/preview`), {
    params: Promise.resolve({ id }),
  });
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/notices/[id]/preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("输出对齐服务宽表列名，供 NoticeDetail 直接消费", async () => {
    findDetailPublished.mockResolvedValue({
      id: 1786635783,
      reference: "RFQ-001",
      title: "某医院影像设备采购",
      notice_type: "Tender",
      country: "CN",
      agency: "RAW AGENCY",
      agency_full: "FULL AGENCY",
      organization: "ORG",
      deadline: "2026-12-01",
      deadline_ts: 1797000000,
      estimated_value: "5000.00",
    });

    const body = await callPreview();

    expect(body).toMatchObject({
      notice_pk: 1786635783,
      reference: "RFQ-001",
      title: "某医院影像设备采购",
      notice_type_code: "Tender",
      country_code: "CN",
      buyer_name: "FULL AGENCY",
      deadline_ts: 1797000000,
      estimated_value: "5000.00",
    });
  });

  it("不再吐基表历史列名（避免与宽表口径双轨）", async () => {
    findDetailPublished.mockResolvedValue({
      id: 1, reference: "R", title: "T", notice_type: "Award",
      country: "US", agency: "A", agency_full: "AF", organization: "O",
      deadline: "2026-01-01", deadline_ts: 100, estimated_value: "9",
    });

    const body = await callPreview("1");

    for (const stale of ["country", "notice_type", "deadline", "agency", "agency_full"]) {
      expect(body).not.toHaveProperty(stale);
    }
  });
});
