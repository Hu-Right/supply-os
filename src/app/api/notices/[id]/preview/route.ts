/**
 * GET /api/notices/:id/preview — 锁定态有限预览
 *
 * @module app/api/notices/[id]/preview/route
 * @description 返回公告的部分字段（机构名、分类标签等），用于锁定态增强展示。
 *              不含敏感字段，失败静默不阻断详情页。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, 40000, "无效的公告 ID");

    const ctx = getContext();
    const { detailRepo } = ctx.notice;
    const notice = await detailRepo.findDetail(noticeId);
    if (!notice) routeError(404, 40044, "公告不存在");

    // 返回有限预览字段：机构名、国家、分类、截止日期等（不含完整描述）
    return NextResponse.json({
      id: notice.id,
      title: notice.title || "",
      agency: notice.agency || notice.agency_full || notice.organization || "",
      agency_full: notice.agency_full || "",
      country: notice.country || "",
      notice_type: notice.notice_type || "",
      deadline: notice.deadline || "",
      estimated_value: notice.estimated_value || "",
      reference: notice.reference || "",
    });
  },
);
