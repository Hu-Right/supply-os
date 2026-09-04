/**
 * GET /api/notices/:id/detail — 公告详情（需认证+解锁）
 *
 * @module app/api/notices/[id]/detail/route
 * @description /content 端点已拆分到 [id]/content/route.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "@/lib/services/notices";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, 40000, "无效的公告 ID");

    const ctx = getContext();
    const { detailRepo, unlockRepo } = ctx.notice;

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(auth.userId, noticeId),
      detailRepo.findDetail(noticeId),
    ]);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });
    if (!notice) routeError(404, 40044, "公告不存在");

    // 查询合格机会：精选公告必有合格机会，report_available/report_url 依赖此数据
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const payload = normalizeNoticeDetailPayload(notice, unlock, opportunity);
    return NextResponse.json(payload);
  },
);
