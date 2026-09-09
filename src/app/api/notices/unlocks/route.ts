/**
 * GET /api/notices/unlocks — 用户解锁的公告列表
 *
 * @module app/api/notices/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listUserUnlocks } from "@/lib/services/notice-service";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rows = await listUserUnlocks(auth.userId);
  return NextResponse.json(rows);
});
