/**
 * GET /api/notices/unlocks — 用户解锁的公告列表
 *
 * @module app/api/notices/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { NoticeUnlockRepo } from "@/lib/repos/notices/notice-unlock.repo";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const pool = getPool();
  const unlockRepo = new NoticeUnlockRepo(pool);
  const rows = await unlockRepo.listNoticeUnlocks(auth.userId);
  return NextResponse.json(rows);
});
