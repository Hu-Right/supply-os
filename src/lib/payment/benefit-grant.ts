/** 支付履约：一条订阅、主账号席位及完整的矩阵额度；必须处于支付事务中。 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { BenefitWriteRepo } from "../repos/benefit-write.repo";

export interface BenefitFulfillDeps {
  catalog: BenefitSystemRepo;
  write: BenefitWriteRepo;
}

export type GrantFailure = "PLAN_NOT_FOUND" | "PLAN_NOT_SELLABLE" | "ORDER_NO_MISSING" | "MATRIX_INVALID" | "AMOUNT_INVALID";
export class GrantError extends Error {
  constructor(public code: GrantFailure, message: string) {
    super(message);
    this.name = "GrantError";
  }
}

export interface GrantParams {
  userId: number;
  orderNo: string;
  planCode: string;
  pricePaid: number;
  currency?: string;
  /** 升级时继承来源订阅的期限，不重新购买一年。 */
  startedAt?: Date | string;
  expiresAt?: Date | string | null;
}

export async function grantSubscriptionForPlan(
  { catalog, write }: BenefitFulfillDeps,
  conn: PoolConnection,
  params: GrantParams,
) {
  const orderNo = params.orderNo.trim();
  if (!orderNo) throw new GrantError("ORDER_NO_MISSING", "缺少成交订单号");
  const plan = await catalog.getPlan(params.planCode);
  if (!plan) throw new GrantError("PLAN_NOT_FOUND", "新目录中不存在该套餐");
  if (Number(plan.is_active) !== 1 || plan.price_mode !== "fixed") {
    throw new GrantError("PLAN_NOT_SELLABLE", "该套餐不可自助成交");
  }
  if (params.currency && params.currency !== plan.currency) throw new GrantError("AMOUNT_INVALID", "付款币种与套餐不符");
  // 可售性/币种先判：contact 档不得自助成交须回 PLAN_NOT_SELLABLE，不能被 price_paid<=0 的泛化 AMOUNT_INVALID 抢先。
  if (!Number.isInteger(params.userId) || params.userId <= 0 || !Number.isFinite(params.pricePaid) || params.pricePaid <= 0) {
    throw new GrantError("AMOUNT_INVALID", "付款账号或实付金额无效");
  }

  let expiresAt = params.expiresAt;
  if (expiresAt === undefined) {
    if (plan.billing_period_days === null) {
      expiresAt = null;
    } else {
      const days = Number(plan.billing_period_days);
      if (!Number.isInteger(days) || days <= 0) throw new GrantError("PLAN_NOT_SELLABLE", "套餐有效期无效");
      const [rows] = await conn.query<RowDataPacket[]>("SELECT DATE_ADD(NOW(), INTERVAL ? DAY) AS expires_at", [days]);
      if (!rows[0]?.expires_at) throw new GrantError("PLAN_NOT_SELLABLE", "数据库未返回到期时间");
      expiresAt = rows[0].expires_at as Date;
    }
  }
  const subscriptionId = await write.insertSubscription(conn, {
    ownerUserId: params.userId, planCode: plan.plan_code, sourceOrderNo: orderNo,
    pricePaid: params.pricePaid, currency: params.currency ?? plan.currency,
    seatLimit: Number(plan.seat_limit), startedAt: params.startedAt, expiresAt,
  });
  await write.ensureOwnerSeat(conn, { subscriptionId, ownerUserId: params.userId });
  const grant = await write.grantQuotaPoolsForPlan(conn, catalog, {
    planCode: plan.plan_code, subscriptionId, seatUserId: params.userId,
  });
  if (grant.anomalies.length) throw new GrantError("MATRIX_INVALID", grant.anomalies.join("；"));
  return { subscriptionId, planCode: plan.plan_code, expiresAt, grantedBenefits: grant.granted };
}
