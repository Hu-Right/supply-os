/**
 * GET /api/notices/access-ids — 用户解锁的公告列表
 *
 * @module app/api/notices/access-ids/route
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listUserAccessRecords } from "@/lib/services/notice-service";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rows = await listUserAccessRecords(auth.userId);
  return NextResponse.json(rows);
});
