/**
 * GET /api/notices/:id/report/preview — 报告预览（结构化 JSON 摘要）
 *
 * @module app/api/notices/[id]/report/preview/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { resolveNoticeAccess } from "@/lib/services/notice-access";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "@/lib/services/benefit-matrix";
import {
  buildBidReportPreviewText,
  estimateFullReportCharCount,
  mergeBidReportRow,
} from "@/lib/services/bid-report";
import { EC_ACCESS_FORBIDDEN, EC_NOTICE_NOT_FOUND_404, EC_REPORT_NOT_AVAILABLE } from "@/shared/constants/api";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfo } from "@/lib/services/platform/resolve";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    const userId = auth.userId;

    if (!noticeId) {
      routeError(400, EC_NOTICE_NOT_FOUND_404, "请先登录并指定公告");
    }

    const ctx = getContext();
    const { detailRepo, unlockRepo } = ctx.notice;
    const opportunitiesRepo = ctx.opportunitiesRepo;

    const [access, notice] = await Promise.all([
      resolveNoticeAccess({
        userId,
        noticeId,
        unlockRepo,
        benefitRepo: ctx.benefitSystemRepo,
      }),
      detailRepo.findDetailPublished(noticeId),
    ]);
    if (!notice) routeError(404, EC_NOTICE_NOT_FOUND_404, "公告不存在");

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    if (!qualified) routeError(404, EC_REPORT_NOT_AVAILABLE, "报告不可用");

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;
    const row = mergeBidReportRow(notice, opportunity);
    // 平台展示名改由 platform_aliases 表驱动（唯一入口）：解析 url/码后注入 row.platform_display
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    row.platform_display = platformInfo(String(row.source_url || row.source_platform || ""), platformSnap)?.canonical ?? "";

    const lang = req.nextUrl.searchParams.get("lang") || "zh";
    const sections = buildBidReportPreviewText(row, lang);
    const totalReportChars = estimateFullReportCharCount(row);

    // 投标可行性报告属企业级工具（2026-10-29）：企业/人工档可预览；个人档引导升级企业版
    if (!(await ctx.benefitSystemRepo.isEntitled(userId, BID_FEASIBILITY_REPORT_BENEFIT))) {
      routeError(403, EC_ACCESS_FORBIDDEN, "中文拆解报告为企业版权益", { feature: BID_FEASIBILITY_REPORT_BENEFIT });
    }

    // 未解锁（会员打开即自动解锁，此处仅覆盖竞态）：服务端截断 sections 内容
    const MAX_CHARS_PER_SECTION = 500;
    const isUnlocked = !!access.unlock || access.accessibleByPlan;
    const safeSections = isUnlocked
      ? sections
      : sections.map((s: { heading: string; body: string }) => ({
          ...s,
          body: s.body.length > MAX_CHARS_PER_SECTION ? s.body.slice(0, MAX_CHARS_PER_SECTION) + "…" : s.body,
        }));

    return NextResponse.json({
      sections: safeSections,
      isUnlocked,
      hasFullReport: true,
      totalReportChars,
    });
  },
);
