/**
 * GET /api/notices/[id]/detail — 公告详情（需认证+解锁）
 * GET /api/notices/[id]/content — 公告全文（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";
import { normalizeNoticeDetailPayload } from "@/server/services/notices";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const noticeId = Number(id);
  if (!noticeId) return NextResponse.json({ code: 40000, message: "Invalid ID" }, { status: 400 });

  const url = new URL(req.url);
  const ctx = getContext();
  const { detailRepo, unlockRepo } = ctx.notice;

  if (url.pathname.endsWith("/content")) {
    const notice = await detailRepo.findDetail(noticeId);
    if (!notice) return NextResponse.json({ code: 40044, message: "公告不存在" }, { status: 404 });
    return NextResponse.json(notice);
  }

  // detail 端点
  const [unlock, notice] = await Promise.all([
    unlockRepo.findUnlock(auth.userKey, noticeId),
    detailRepo.findDetail(noticeId),
  ]);
  if (!unlock) return NextResponse.json({ code: 40013, message: "公告已锁定，请先解锁", core_locked: true }, { status: 403 });
  if (!notice) return NextResponse.json({ code: 40044, message: "公告不存在" }, { status: 404 });

  const payload = normalizeNoticeDetailPayload(notice, unlock, null);
  return NextResponse.json(payload);
}
