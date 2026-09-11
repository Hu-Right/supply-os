/**
 * GET /api/rfq/my — 当前用户发布的 RFQ 列表
 *
 * @module app/api/rfq/my/route
 * @description 需登录。返回当前用户创建的所有 RFQ（含 draft/published/closed）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || ""; // draft / published / closed / 空=全部
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(sp.get("page_size")) || 12, 4), 48);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["n.user_id = ?", "n.notice_type = 'RFQ'"];
  const params: unknown[] = [auth.userId];

  if (status === "draft" || status === "published" || status === "closed") {
    conditions.push("n.rfq_status = ?");
    params.push(status);
  }

  const whereSql = conditions.join(" AND ");

  const [countRows, dataRows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${whereSql}`, params),
    pool.query(
      `SELECT n.id, n.title, n.country, n.estimated_value, n.deadline_sec,
              n.rfq_status, n.published_date, n.created_at
       FROM crm_bid_notices n WHERE ${whereSql}
       ORDER BY n.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]) as [RowDataPacket[], RowDataPacket[]];

  const total = Number((countRows as RowDataPacket[])[0]?.total || 0);
  const items = (dataRows as RowDataPacket[]).map((row) => ({
    id: Number(row.id),
    title: String(row.title || ""),
    country: String(row.country || ""),
    budgetUsd: Number(row.estimated_value) || 0,
    deadlineSec: Number(row.deadline_sec) || 0,
    status: String(row.rfq_status || "draft"),
    publishedDate: row.published_date ? String(row.published_date) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  }));

  return NextResponse.json({ items, total, page, page_size: pageSize });
});
