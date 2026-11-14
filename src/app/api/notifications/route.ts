/**
 * GET /api/notifications — 收件箱列表（需登录）
 *
 * @module app/api/notifications/route
 * @description 支持分页、仅未读、按类型族过滤（`type_prefix`，如 `procurement.`）。
 *              返回裸载荷 { items, total, unread, page, pageSize }；未读数恒为全站口径，
 *              不随筛选变化（铃铛徽标与列表筛选互不干扰）。
 *              另：PATCH 全部已读由 `POST` 同路径承担（body { action: "mark_all_read" }），
 *              避免为一个动作再开一条路由。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { listNotifications, markAllRead, markReadMany, deleteNotifications, unreadCount } from "@/lib/services/notifications";
import { deleteResultViewOf, markAllReadViewOf } from "@/lib/services/notifications/views";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("page_size")) || 20, 1), 100);
  const unreadOnly = sp.get("unread_only") === "1" || sp.get("unread_only") === "true";
  const typePrefix = (sp.get("type_prefix") || "").trim().slice(0, 32) || null;
  const types = (sp.get("types") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 16);
  const offset = (page - 1) * pageSize;

  const [{ items, total }, unread] = await Promise.all([
    listNotifications(pool, auth.userId, { limit: pageSize, offset, unreadOnly, typePrefix, types }),
    unreadCount(pool, auth.userId),
  ]);

  return NextResponse.json({ items, total, unread, page, pageSize });
});

const BATCH_ACTIONS = ["mark_all_read", "mark_read", "delete", "delete_all"] as const;
type BatchAction = (typeof BATCH_ACTIONS)[number];

/**
 * 批量动作：{ action, ids?, types?, typePrefix? }
 * - mark_all_read：按当前筛选全部已读
 * - mark_read：按 ids 标记已读
 * - delete：按 ids 软删
 * - delete_all：按当前筛选全部软删（前端须二次确认）
 */
export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: number[];
    types?: string[];
    typePrefix?: string;
  };
  const action = body.action as BatchAction | undefined;
  if (!action || !BATCH_ACTIONS.includes(action)) routeError(400, EC_INVALID_PARAMS, "不支持的操作");

  const scope = {
    types: Array.isArray(body.types) && body.types.length > 0 ? body.types.slice(0, 16) : null,
    typePrefix: body.typePrefix ? String(body.typePrefix).slice(0, 32) : null,
  };

  if (action === "mark_all_read") {
    return NextResponse.json(markAllReadViewOf(await markAllRead(pool, auth.userId, scope)));
  }
  if (action === "mark_read") {
    return NextResponse.json(markAllReadViewOf(await markReadMany(pool, auth.userId, body.ids ?? [])));
  }
  if (action === "delete") {
    return NextResponse.json(deleteResultViewOf(await deleteNotifications(pool, auth.userId, { ids: body.ids ?? [] })));
  }
  return NextResponse.json(
    deleteResultViewOf(await deleteNotifications(pool, auth.userId, { ...scope, all: true })),
  );
});
