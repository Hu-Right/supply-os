/**
 * GET /api/notices/:id/similar — 按 旧品类品类返回相似活跃公告（最多 6 条，无兜底）
 *
 * @module app/api/notices/[id]/similar/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { extractUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { findSimilarNotices } from "@/lib/services/notices/similar";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { canReadNoticeTranslation, maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `similar:${extractClientIp(req)}`);
  if (rl) return rl;
  const auth = await extractUserKey(req); // 与 unified-search 一致：登录可选，列表级公开数据

  const { id } = await params;
  const noticeId = Number(id);
  if (!noticeId) routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(12, Math.max(1, Number(sp.get("limit")) || 6));
  const locale = sp.get("locale") || undefined;

  const ctx = getContext();
  const items = await findSimilarNotices(ctx.dbPool, noticeId, limit, locale);
  // 与 unified-search / detail 同一口径：行先过 view mapper 再对外（红线②），
  // 译文再按权益裁剪（2026-11-24 口径 A+3）
  const list = toNoticeListView(items);
  if (!(await canReadNoticeTranslation(ctx.benefitSystemRepo, auth.userId))) {
    maskTranslationFieldList(list);
  }
  return NextResponse.json({ items: list });
});
