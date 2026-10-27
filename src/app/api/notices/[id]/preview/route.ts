/**
 * GET /api/notices/:id/preview — 锁定态有限预览
 *
 * @module app/api/notices/[id]/preview/route
 * @description 返回公告的部分字段（机构名、分类标签等），用于锁定态增强展示。
 *              不含敏感字段，失败静默不阻断详情页。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
    const { detailRepo } = ctx.notice;
    const notice = await detailRepo.findDetailPublished(noticeId);
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 有限预览字段：对齐服务宽表列名（与 unified-search / NoticeDetail 同口径）。
    // 基表 crm_bid_notices 的历史列名在本路由一次性映射为宽表名，
    // 否则锁定公告深链进入详情时消费方按宽表名取值落空，回落"未知机构/全球/暂无截止/0.00"。
    return NextResponse.json({
      notice_pk: notice.id,
      reference: notice.reference || "",
      title: notice.title || "",
      notice_type_code: notice.notice_type || "",
      country_code: notice.country || "",
      buyer_name: notice.agency_full || notice.agency || notice.organization || "",
      deadline_ts: notice.deadline_ts ?? null,
      estimated_value: notice.estimated_value || "",
    });
  },
);
