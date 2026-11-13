/**
 * RFQ 邀约名单（新表 rfq_invitation）
 * @module lib/services/rfq/invitations
 *
 * @description 过渡期双写：供应商报价资格仍由 legacy `rfq_invites`（按投影 id）判定，
 *              而"受邀需求"页面读新表 `rfq_invitation`（按 demand id）。两条链路在
 *              P2 报价迁表后合并，届时删除在这里的双写。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 投影行 id（bid_notices.id）→ 需求 id；未投影返回 null */
export async function findDemandIdByNoticePk(
  db: Pool,
  noticePk: number,
): Promise<number | null> {
  const [rows] = await db.query(
    "SELECT id FROM rfq_demand WHERE notice_pk = ? LIMIT 1",
    [noticePk],
  );
  const row = (rows as RowDataPacket[])[0];
  return row ? Number(row.id) : null;
}

/**
 * 记录邀约（幂等：主键 demand_id + supplier_user_id 去重）。
 * @returns 实际尝试写入的条数（不是新增条数——INSERT IGNORE 不区分）
 */
export async function recordInvitations(
  db: Pool,
  input: { demandId: number; supplierUserIds: number[]; source?: "match" | "manual"; now?: number },
): Promise<number> {
  const ids = [...new Set(input.supplierUserIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return 0;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const source = input.source ?? "match";
  const values = ids.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  const params: unknown[] = [];
  for (const id of ids) params.push(input.demandId, id, source, "email", now, now);
  await db.query(
    `INSERT IGNORE INTO rfq_invitation (demand_id, supplier_user_id, source, channel, sent_at, created_at)
     VALUES ${values}`,
    params,
  );
  return ids.length;
}
