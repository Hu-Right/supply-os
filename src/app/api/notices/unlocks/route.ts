/**
 * GET /api/notices/unlocks — 用户解锁的公告列表
 *
 * @module app/api/notices/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const pool = getPool();
  const unlockRepo = new NoticeUnlockRepo(pool);
  const rows = await unlockRepo.listNoticeUnlocks(auth.userKey);
  return NextResponse.json(rows);
}
