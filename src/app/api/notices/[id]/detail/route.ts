/**
 * GET /api/notices/:id/detail — 公告详情（需认证+解锁）
 *
 * @module app/api/notices/[id]/detail/route
 * @description /content 端点已拆分到 [id]/content/route.ts。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices";
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfo } from "@/lib/services/platform/resolve";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { EC_OUT_OF_CATEGORY, EC_INVALID_PARAMS, EC_CONTENT_LOCKED, EC_NOT_FOUND } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
  // 行业墙：被行业限定档位的用户只能访问其绑定品目大类内的公告（8,800元/行业口径）
  if (!(await canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId))) {
    routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { out_of_category: true });
  }
    const { unlockRepo } = ctx.notice;

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(auth.userId, noticeId),
      findPublicDetail(ctx.dbPool, noticeId),
    ]);
    if (!unlock) routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先解锁", { core_locked: true });
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 合格商机只用于资格 Tab / 报告；详情主内容字段全部来自服务表原字段。
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    const platform = platformInfo(String(notice.source_url || opportunity?.source_url || ""), platformSnap);
    return NextResponse.json({
      ...notice,
      core_locked: false,
      unlock_type: unlock.unlock_type,
      unlocked_at: unlock.unlocked_at,
      platform,
      report_available: !!opportunity,
      report_url: opportunity ? `/api/notices/${notice.notice_pk}/report` : "",
      eligibility: opportunity?.eligibility ?? "",
      technical_hurdles: opportunity?.technical_hurdles ?? "",
      supplier_conditions: opportunity?.supplier_conditions ?? "",
      bid_overview: opportunity?.bid_overview ?? "",
      description_other: opportunity?.description_other ?? "",
      ai_products: opportunity?.ai_products ?? null,
      ai_analysis: opportunity?.ai_analysis ?? null,
      deadline_timezone: opportunity?.deadline_timezone ?? "",
    });
  },
);
