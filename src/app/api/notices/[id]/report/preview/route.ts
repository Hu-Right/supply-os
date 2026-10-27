/**
 * GET /api/notices/:id/report/preview — 报告预览（结构化 JSON 摘要）
 *
 * @module app/api/notices/[id]/report/preview/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import { NOTICE_TRANSLATION_BENEFIT } from "@/lib/services/benefit-matrix";
import {
  buildBidReportPreviewText,
  estimateFullReportCharCount,
  mergeBidReportRow,
} from "@/lib/services/bid-report";
import { EC_NOTICE_NOT_FOUND_404, EC_REPORT_NOT_AVAILABLE } from "@/shared/constants/api";
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

    const [unlock, notice] = await Promise.all([
      unlockRepo.findUnlock(userId, noticeId),
      detailRepo.findDetailPublished(noticeId),
    ]);
    if (!notice) routeError(404, EC_NOTICE_NOT_FOUND_404, "公告不存在");

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    if (!qualified) routeError(404, EC_REPORT_NOT_AVAILABLE, "报告不可用");

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;
    const row = mergeBidReportRow(notice, opportunity);
    // 平台展示名改由 crm_platform_aliases 表驱动（唯一入口）：解析 url/码后注入 row.platform_display
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    row.platform_display = platformInfo(String(row.source_url || row.source_platform || ""), platformSnap)?.canonical ?? "";

    const lang = req.nextUrl.searchParams.get("lang") || "zh";
    const sections = buildBidReportPreviewText(row, lang);
    const totalReportChars = estimateFullReportCharCount(row);

    // 中文报告属"中文能力"资产：无 notice_translation 权益（129/999 等）即使已解锁，预览也降级为截断 teaser（2026-09-25 权益重设计）
    const canSeeChineseReport = await ctx.benefitSystemRepo.isEntitled(userId, NOTICE_TRANSLATION_BENEFIT);

    // 未解锁或无中文能力权益：服务端截断 sections 内容
    const MAX_CHARS_PER_SECTION = 500;
    const safeSections = unlock && canSeeChineseReport
      ? sections
      : sections.map((s: { heading: string; body: string }) => ({
          ...s,
          body: s.body.length > MAX_CHARS_PER_SECTION ? s.body.slice(0, MAX_CHARS_PER_SECTION) + "…" : s.body,
        }));

    return NextResponse.json({
      sections: safeSections,
      isUnlocked: !!unlock,
      hasFullReport: true,
      totalReportChars,
    });
  },
);
