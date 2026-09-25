/**
 * GET /api/notices/:id/content — 公告全文内容（完整 description + title + description_cn）
 *
 * @module app/api/notices/[id]/content/route
 * @description 搜索 SQL 将 description 截断为 300 字符，本端点拉取完整原文。
 *              同时返回 description_cn（来自机会表），确保中文环境直接显示中文描述。
 *
 *              ⚠️ 付费墙闸口：全文属解锁后内容，必须先通过与 /detail 相同的
 *              解锁校验（findUnlock），未解锁一律 403 core_locked。
 *              该端点曾是付费墙旁门（审查报告 F1）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import { NOTICE_TRANSLATION_BENEFIT } from "@/lib/services/benefit-matrix";
import { preferValue } from "@/lib/utils/json";

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
      detailRepo.findDetailPublished(noticeId),
    ]);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });
    if (!notice) routeError(404, 40044, "公告不存在");
    
    // 从机会表取完整描述（主表 description 仅存标题，完整原文在 crm_bid_opportunities）
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const fullDescription = String(preferValue(opportunity?.description, notice.description) || "");
    // 档位门控（2026-09-24）：description_cn 属中文内容，无 notice_translation 权益时置空，前端回落原文
    const canSeeTranslation = await ctx.benefitSystemRepo.isEntitled(auth.userId, NOTICE_TRANSLATION_BENEFIT);
    const descriptionCn = canSeeTranslation ? String(opportunity?.description_cn || "") : "";
    
    return NextResponse.json({
      description: fullDescription,
      title: notice.title || "",
      description_cn: descriptionCn,
      // 保留完整原文供"查看原文"切换使用（主表 description 仅存标题）
      original_description: fullDescription,
    });
  },
);
