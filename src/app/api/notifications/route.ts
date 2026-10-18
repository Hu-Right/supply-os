/**
 * GET /api/notifications — 收件箱列表（需登录）
 *
 * @module app/api/notifications/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listNotifications, unreadCount } from "@/lib/services/notifications";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("page_size")) || 20, 1), 100);
  const unreadOnly = sp.get("unread_only") === "1" || sp.get("unread_only") === "true";
  const offset = (page - 1) * pageSize;

  const [{ items, total }, unread] = await Promise.all([
    listNotifications(pool, auth.userId, { limit: pageSize, offset, unreadOnly }),
    unreadCount(pool, auth.userId),
  ]);

  return NextResponse.json({ code: 0, message: "ok", data: { items, total, unread, page, page_size: pageSize } });
});
