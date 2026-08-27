/**
 * GET /api/notices/:id/detail — 公告详情（需认证+解锁）
 *
 * @module app/api/notices/[id]/detail/route
 * @description /content 端点已拆分到 [id]/content/route.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { normalizeNoticeDetailPayload } from "@/lib/services/notices";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const noticeId = Number(id);
  if (!noticeId) return NextResponse.json({ code: 40000, message: "Invalid ID" }, { status: 400 });

  const ctx = getContext();
  const { detailRepo, unlockRepo } = ctx.notice;

  const [unlock, notice] = await Promise.all([
    unlockRepo.findUnlock(auth.userKey, noticeId),
    detailRepo.findDetail(noticeId),
  ]);
  if (!unlock) return NextResponse.json({ code: 40013, message: "公告已锁定，请先解锁", core_locked: true }, { status: 403 });
  if (!notice) return NextResponse.json({ code: 40044, message: "公告不存在" }, { status: 404 });

  const payload = normalizeNoticeDetailPayload(notice, unlock, null);
  return NextResponse.json(payload);
}
