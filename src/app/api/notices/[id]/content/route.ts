/**
 * GET /api/notices/:id/content — 公告全文内容（完整 description + title + description_cn）
 *
 * @module app/api/notices/[id]/content/route
 * @description 搜索 SQL 将 description 截断为 300 字符，本端点拉取完整原文。
 *              同时返回 description_cn（来自机会表），确保中文环境直接显示中文描述。
 *
 *              ⚠️ 付费墙闸口：全文属解锁后内容，必须先通过与 /detail 相同的
 *              解锁校验（findGrant），未解锁一律 403 core_locked。
 *              该端点曾是付费墙旁门（审查报告 F1）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { NOTICE_TRANSLATION_BENEFIT } from "@/lib/services/benefit-matrix";
import { canAccessNotice } from "@/lib/services/industry-scope";
import { resolveNoticeAccess } from "@/lib/services/notice-access";
import { EC_OUT_OF_CATEGORY, EC_INVALID_PARAMS, EC_CONTENT_LOCKED, EC_NOT_FOUND } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

    const ctx = getContext();
    const { accessGrantRepo } = ctx.notice;

    // 2026-11-24 并行化：行业墙 / 解锁判定 / 公告行 / 译文权益互不依赖，一次发完。
    const [allowedByIndustry, access, notice, canSeeTranslation] = await Promise.all([
      canAccessNotice(ctx.dbPool, ctx.benefitSystemRepo, auth.userId, noticeId),
      resolveNoticeAccess({
        userId: auth.userId,
        noticeId,
        accessGrantRepo,
        benefitRepo: ctx.benefitSystemRepo,
      }),
      findPublicDetail(ctx.dbPool, noticeId),
      ctx.benefitSystemRepo.isEntitled(auth.userId, NOTICE_TRANSLATION_BENEFIT),
    ]);
    if (!allowedByIndustry) {
      routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { outOfCategory: true });
    }
    if (!access.grant && !access.accessibleByPlan) {
      routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先开通会员", { coreLocked: true });
    }
    if (!notice) routeError(404, EC_NOT_FOUND, "公告不存在");

    // 正文以服务表为准（公告原文）；标题也走服务表，商机标题已在构建时覆盖。
    const fullDescription = String(notice.description || "");
    // 中文正文：服务表已有商机中文描述则直接用；无译文权益时置空，前端回落原文
    const descriptionCn = canSeeTranslation ? String(notice.description_cn || "") : "";

    return NextResponse.json({
      description: fullDescription,
      title: notice.title || "",
      descriptionCn,
      originalDescription: fullDescription,
    });
  },
);
