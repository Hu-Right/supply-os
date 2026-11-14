/**
 * GET /api/rfq/invitations/mine — 供应商的受邀需求
 *
 * @module app/api/rfq/invitations/mine/route
 * @description 定向邀约（`visibility='targeted'`）需求对供应商的唯一入口。
 *              只返回未被退订、且仍可参与（published / evaluation）的邀请；
 *              `quoted` 标识该供应商当前是否已有有效报价。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT i.demand_id AS id, i.sent_at, i.accepted_at,
            d.reference, d.title, d.status, d.close_at, d.category_code,
            d.province_name, d.budget_amount, d.budget_currency, d.budget_confidential,
            c1.name_zh AS category_l2_name,
            c0.name_zh AS category_l1_name,
            EXISTS(
              SELECT 1 FROM rfq_quotes q
               WHERE q.rfq_id = d.notice_pk AND q.supplier_user_id = ?
                 AND q.status <> 'withdrawn'
            ) AS quoted
       FROM rfq_invitation i
       JOIN rfq_demand d ON d.id = i.demand_id
       LEFT JOIN commodity_backbone c1 ON c1.code = d.category_code
       LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(d.category_code, 6) AND c0.level = 1
      WHERE i.supplier_user_id = ?
        AND i.unsubscribed_at IS NULL
        AND d.status IN (?, ?)
      ORDER BY d.id DESC
      LIMIT 100`,
    [auth.userId, auth.userId, DEMAND_STATUS.PUBLISHED, DEMAND_STATUS.EVALUATION],
  );

  const items = (rows as RowDataPacket[]).map((r) => {
    const confidential = Number(r.budget_confidential) === 1;
    return {
      id: Number(r.id),
      reference: String(r.reference ?? ""),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      closeAt: r.close_at == null ? null : Number(r.close_at),
      categoryL1: String(r.category_l1_name ?? ""),
      categoryL2: String(r.category_l2_name ?? ""),
      province: String(r.province_name ?? ""),
      budgetAmount: confidential || r.budget_amount == null ? null : Number(r.budget_amount),
      budgetConfidential: confidential,
      currency: String(r.budget_currency || "CNY"),
      sentAt: r.sent_at == null ? null : Number(r.sent_at),
      acceptedAt: r.accepted_at == null ? null : Number(r.accepted_at),
      quoted: Number(r.quoted) === 1,
    };
  });

  return NextResponse.json({ items, total: items.length });
});
