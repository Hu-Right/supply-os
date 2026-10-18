/**
 * PATCH /api/notifications/[id] — 标记单条站内信已读（限本人）
 *
 * @module app/api/notifications/[id]/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { markRead } from "@/lib/services/notifications";

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const notifId = Number(id);
    if (!Number.isFinite(notifId) || notifId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的通知 ID");

    const pool = getPool();
    const ok = await markRead(pool, auth.userId, notifId);
    if (!ok) routeError(404, EC_NOT_FOUND, "通知不存在或无权访问");

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
