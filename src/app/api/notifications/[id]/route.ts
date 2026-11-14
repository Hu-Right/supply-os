/**
 * GET   /api/notifications/[id] — 单条详情（限本人）
 * PATCH /api/notifications/[id] — 标记单条站内信已读（限本人）
 *
 * @module app/api/notifications/[id]/route
 * @description 详情页据此拿到完整 payload 并渲染多语言正文；PATCH 幂等（已读再标仍 200）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { getNotification, markRead } from "@/lib/services/notifications";
import { notificationViewOf } from "@/lib/services/notifications/views";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId) || notifId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的通知 ID");

  const item = await getNotification(getPool(), auth.userId, notifId);
  if (!item) routeError(404, EC_NOT_FOUND, "通知不存在或无权访问");

  return NextResponse.json({ item: notificationViewOf(item) });
});

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const notifId = Number(id);
    if (!Number.isFinite(notifId) || notifId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的通知 ID");

    const pool = getPool();
    const ok = await markRead(pool, auth.userId, notifId);
    if (!ok) routeError(404, EC_NOT_FOUND, "通知不存在或无权访问");

    return NextResponse.json({ ok: true });
  },
);
