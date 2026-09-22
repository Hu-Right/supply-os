/**
 * GET /api/rfq/my — 当前用户发布的 RFQ 列表
 *
 * @module app/api/rfq/my/route
 * @description 需登录。返回当前用户创建的所有 RFQ（含 draft/published/closed）。
 */
import { RFQ_STATUS, RFQ_USER_FILTERABLE_STATUSES } from "@/shared/constants/rfq";
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

  if ([status].every((s) => (RFQ_USER_FILTERABLE_STATUSES as readonly string[]).includes(s))) {
    conditions.push("n.rfq_status = ?");
    params.push(status);
  }

  const whereSql = conditions.join(" AND ");

  // pool.query 的 Promise 解析为 [rows, fields] 元组；Promise.all 结果是
  // [[rows1,fields1],[rows2,fields2]]，必须取每个结果的 [0] 才是真实行数组。
  const [countRes, dataRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${whereSql}`, params),
    pool.query(
      `SELECT n.id, n.reference, n.title, n.country, n.estimated_value, n.currency, n.deadline_sec,
              n.rfq_status, n.published_date, n.create_time
       FROM crm_bid_notices n WHERE ${whereSql}
       ORDER BY n.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]);
  const countRows = countRes[0] as RowDataPacket[];
  const dataRows = dataRes[0] as RowDataPacket[];

  const total = Number(countRows[0]?.total || 0);
  const items = dataRows.map((row) => ({
    id: Number(row.id),
    reference: String(row.reference || ""),
    title: String(row.title || ""),
    country: String(row.country || ""),
    // 注意：平台 RFQ 的 estimated_value 为“万元”数值（币种见 currency），
    // 字段名 budgetUsd 为历史残留命名（plaza 预算区间筛选复用），勿按美元字面理解。
    budgetUsd: Number(row.estimated_value) || 0,
    currency: String(row.currency || "CNY"),
    deadlineSec: Number(row.deadline_sec) || 0,
    status: String(row.rfq_status || RFQ_STATUS.DRAFT),
    // 发布日仅在已发布时有意义（历史脏数据：旧版 create 在草稿期就写了 CURDATE）
    publishedDate: String(row.rfq_status) === RFQ_STATUS.PUBLISHED && row.published_date ? String(row.published_date) : null,
    createdAt: row.create_time != null ? String(row.create_time) : null,
  }));

  return NextResponse.json({ items, total, page, page_size: pageSize });
});
