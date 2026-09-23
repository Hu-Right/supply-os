/** 新订阅升级：锁定来源，承接期限和用量，再冻结被替代订阅。 */
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { PaymentOrderRow } from "../repos/types";
import { grantSubscriptionForPlan, type BenefitFulfillDeps } from "./benefit-grant";

export async function performUpgradeInTransaction(
  conn: PoolConnection,
  deps: BenefitFulfillDeps,
  order: PaymentOrderRow,
): Promise<void> {
  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(order.raw_request || "{}").upgrade_snapshot;
  } catch { throw new Error("UPGRADE_SNAPSHOT_INVALID"); }
  if (!snapshot || !Number.isInteger(snapshot.subscription_id) || !order.original_order_no) {
    throw new Error("UPGRADE_SNAPSHOT_INVALID");
  }
  const sourceId = await deps.write.findSubscriptionIdBySourceOrder(conn, order.original_order_no);
  if (sourceId === null || sourceId !== snapshot.subscription_id) throw new Error("UPGRADE_SOURCE_INVALID");
  const source = await deps.write.findSubscriptionForUpdate(conn, sourceId);
  if (!source || source.owner_user_id !== order.user_id || !source.is_current || source.status !== "active" || source.replaced_by_id) {
    throw new Error("UPGRADE_SOURCE_INVALID");
  }
  const [current, target] = await Promise.all([deps.catalog.getPlan(source.plan_code), deps.catalog.getPlan(order.plan_code)]);
  if (!current || !target || target.price_mode !== "fixed" || Number(target.is_active) !== 1 || current.currency !== target.currency || source.currency !== order.currency || target.currency !== order.currency) {
    throw new Error("UPGRADE_SOURCE_INVALID");
  }
  const currentCents = Math.round(Number(current.price) * 100);
  const targetCents = Math.round(Number(target.price) * 100);
  if (snapshot.current_plan_code !== source.plan_code || snapshot.target_plan_code !== order.plan_code ||
      !Number.isFinite(currentCents) || !Number.isFinite(targetCents) || targetCents <= currentCents ||
      Math.round(Number(snapshot.current_price) * 100) !== currentCents || Math.round(Number(snapshot.target_price) * 100) !== targetCents ||
      Math.round(Number(order.amount) * 100) !== targetCents - currentCents) {
    throw new Error("UPGRADE_PRICE_DRIFT");
  }
  const [pools] = await conn.query<RowDataPacket[]>(
    `SELECT benefit_code, quota_used, status FROM crm_benefit_quotas
      WHERE subscription_id = ? AND scope = 'subscription' AND period_starts_at <= NOW()
      ORDER BY benefit_code, period_starts_at DESC, id DESC FOR UPDATE`, [sourceId],
  );
  const granted = await grantSubscriptionForPlan(deps, conn, {
    userId: order.user_id!, orderNo: order.order_no, planCode: order.plan_code,
    pricePaid: Number(order.amount), currency: order.currency,
    startedAt: source.started_at, expiresAt: source.expires_at,
  });
  const seen = new Set<string>();
  for (const row of pools) {
    if (seen.has(row.benefit_code)) continue;
    seen.add(row.benefit_code);
    if (row.status !== "active" && row.status !== "exhausted") throw new Error("UPGRADE_SOURCE_INVALID");
    const pool = await deps.write.findAndLockCurrentPool(conn, {
      subscriptionId: granted.subscriptionId, seatUserId: source.owner_user_id, benefitCode: row.benefit_code,
    });
    if (!pool || (pool.quota_total !== -1 && pool.quota_total < Number(row.quota_used))) throw new Error("UPGRADE_QUOTA_INVALID");
    const used = pool.quota_total === -1 ? 0 : Number(row.quota_used);
    const [updated] = await conn.execute<ResultSetHeader>(
      `UPDATE crm_benefit_quotas SET quota_used = ?, status = IF(quota_total >= 0 AND quota_used >= quota_total, 'exhausted', 'active') WHERE id = ?`,
      [used, pool.id],
    );
    if (updated.affectedRows !== 1) throw new Error("UPGRADE_QUOTA_INVALID");
  }
  // 成员身份随升级承接；主账号由履约服务创建。目标档席位不足时拒绝整单。
  const [seatCount] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM crm_subscription_seats WHERE subscription_id = ? AND status = 'active'", [sourceId]);
  if (target.seat_limit !== -1 && Number(seatCount[0]?.n ?? 0) > target.seat_limit) throw new Error("UPGRADE_SEAT_LIMIT");
  await conn.execute(`INSERT INTO crm_subscription_seats (subscription_id, member_user_id, is_owner, status, joined_at)
    SELECT ?, member_user_id, 0, 'active', NOW() FROM crm_subscription_seats WHERE subscription_id = ? AND status = 'active' AND is_owner = 0`, [granted.subscriptionId, sourceId]);
  await deps.write.freezePoolsOfSubscription(conn, sourceId);
  await deps.write.linkReplacedSubscription(conn, { oldSubscriptionId: sourceId, newSubscriptionId: granted.subscriptionId });
}
