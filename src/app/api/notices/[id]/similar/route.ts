/**
 * GET /api/notices/:id/similar — 按 UNSPSC 品类返回相似活跃公告（最多 6 条，无兜底）
 *
 * @module app/api/notices/[id]/similar/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { extractUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findSimilarNotices } from "@/lib/services/notices/similar";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `similar:${extractClientIp(req)}`);
  if (rl) return rl;
  await extractUserKey(req); // 与 unified-search 一致：登录可选，列表级公开数据

  const { id } = await params;
  const noticeId = Number(id);
  if (!noticeId) routeError(400, 40000, "无效的公告 ID");

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(12, Math.max(1, Number(sp.get("limit")) || 6));
  const locale = sp.get("locale") || undefined;

  const ctx = getContext();
  const items = await findSimilarNotices(ctx.dbPool, noticeId, limit, locale);
  return NextResponse.json({ items });
});
