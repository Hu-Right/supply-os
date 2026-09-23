/**
 * 权益体系履约服务（支付成交 → 订阅事实 + 席位 + 额度池）
 *
 * @module lib/payment/benefit-grant
 * @description 支付回调履约在**新表组**上的唯一落点：一次成交 = 一条订阅事实 +
 *              一行主账号席位 + 按矩阵发放该档全部可消耗额度池。
 *
 *              为什么单独成模块（而不是散在 activate.ts）：
 *              activate / mock / upgrade / reverse 四条路径都要发放或回收权益，
 *              旧体系正是在这里分叉出"商机路径有订阅即无限放行"的资损缺陷；
 *              发放逻辑收成一个函数，四条路径只能走它，就不能各说一套。
 *
 *              时间口径：expires_at 由 DB 的 NOW() 推算（DATE_ADD），不用应用时钟——
 *              履约与到期扫描读的是同一个时钟，跨机器偏移不会把年付算成 364 天。
 *
 *              纪律：不发"伪订单号"的订阅（旧体系 SUB-{userId}-{plan_code} 懒补建在此禁止），
 *              source_order_no 非空是 crm_plan_subscriptions 的列语义，绕过它就等于
 *              造出一张无对账锚点的订阅。
 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo, PlanCatalogRow } from "../repos/benefit-system.repo";
import { BenefitWriteRepo } from "../repos/benefit-write.repo";

/** 履约业务失败：code 供路由/回调映射为可观测错误，不以 500 兜底 */
export type GrantFailure = "PLAN_NOT_FOUND" | "PLAN_NOT_SELLABLE" | "ORDER_NO_MISSING";

export class GrantError extends Error {
  constructor(
    public code: GrantFailure,
    message: string,
  ) {
    super(message);
    this.name = "GrantError";
  }
}

export interface GrantResult {
  subscriptionId: number;
  planCode: string;
  /** 由 DB 时钟推算；null=永久（目录 billing_period_days 为 NULL 时） */
  expiresAt: Date | null;
  /** 本次发放的额度池权益码 */
  grantedBenefits: string[];
  /** 目录数据不完整/口径未定这类问题：不阻断履约，但必须冒出来让人处理 */
  anomalies: string[];
}

export interface GrantParams {
  /** 订阅归属账号（企业档=主账号） */
  userId: number;
  /** 真实成交订单号，必填 */
  orderNo: string;
  planCode: string;
  /** 实付金额（升级补差 ≠ 标价）；由调用方从支付订单带入 */
  pricePaid: number;
  currency?: string;
}

/**
 * 新表组履约依赖（双轨调用方与履约服务共用同一类型）。
 * 由 AppContext 装配，随订单的 plan_code 属于哪套目录而被选择性消费：
 * 新目录码走 grantSubscriptionForPlan，旧码单继续走旧三表履约链。
 */
export interface BenefitFulfillDeps {
  catalog: BenefitSystemRepo;
  write: BenefitWriteRepo;
}

/**
 * 成交履约：写订阅事实 + 主账号席位 + 按矩阵开额度池。
 * 必须在调用方的支付事务内执行（传入已开启事务的 PoolConnection），
 * 本函数不自开事务——履约与"订单置 paid"必须同生共死。
 */
export async function grantSubscriptionForPlan(
  deps: BenefitFulfillDeps,
  conn: PoolConnection,
  params: GrantParams,
): Promise<GrantResult> {
  const { catalog, write } = deps;
  const orderNo = (params.orderNo ?? "").trim();
  if (!orderNo) throw new GrantError("ORDER_NO_MISSING", "履约拒绝：缺少成交订单号，不得发放订阅");

  const plan = await catalog.getPlan(params.planCode);
  if (!plan) throw new GrantError("PLAN_NOT_FOUND", `履约失败：套餐 ${params.planCode} 不在新目录 crm_plan_catalog`);
  // 只有"在售 + 明码标价"两条件同时成立才可自助成交：
  // free 档不售卖、contact 档无成交价（price_paid 是 NOT NULL 的财务快照，不能拿 0 冒充）
  if (Number(plan.is_active) !== 1 || plan.price_mode !== "fixed") {
    throw new GrantError(
      "PLAN_NOT_SELLABLE",
      `履约失败：套餐 ${plan.plan_code} 不可自助成交（is_active=${plan.is_active}, price_mode=${plan.price_mode}）`,
    );
  }

  const anomalies: string[] = [];
  // price_incl_tax 为 NULL 不阻断成交也不再报异：迁移 093 已把该列注释里
  // 「未定前禁止开单」这句与决策记录互斥的话修订为「仅作报价参考、不得开票」。
  // 开票限制属财务与发票系统的闸门，不由商品目录的一列注释充当；本表 NULL 仍可自助成交。
  // （留此注释是为了防有人把这句当脏数据又把异常加回来）

  const expiresAt = await resolveExpiry(conn, plan);
  const subscriptionId = await write.insertSubscription(conn, {
    ownerUserId: params.userId,
    planCode: plan.plan_code,
    sourceOrderNo: orderNo,
    pricePaid: params.pricePaid,
    currency: params.currency ?? plan.currency,
    seatLimit: Number(plan.seat_limit),
    expiresAt,
  });

  // 每条订阅恰有一行主账号席位，使"席位数 = 行数"恒成立（后续加席位功能才对得上账）
  await write.ensureOwnerSeat(conn, { subscriptionId, ownerUserId: params.userId });

  const grant = await write.grantQuotaPoolsForPlan(conn, catalog, {
    planCode: plan.plan_code,
    subscriptionId,
    seatUserId: params.userId,
  });
  anomalies.push(...grant.anomalies);

  return { subscriptionId, planCode: plan.plan_code, expiresAt, grantedBenefits: grant.granted, anomalies };
}

/** 用 DB 时钟推算到期时间；billing_period_days 为 NULL 时返回 null（永久） */
async function resolveExpiry(conn: PoolConnection, plan: PlanCatalogRow): Promise<Date | null> {
  const days = plan.billing_period_days === null ? null : Number(plan.billing_period_days);
  if (days === null || !Number.isFinite(days)) return null;
  if (days <= 0) {
    throw new GrantError("PLAN_NOT_SELLABLE", `套餐 ${plan.plan_code} 的 billing_period_days=${days} 非法`);
  }
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT DATE_ADD(NOW(), INTERVAL ? DAY) AS expires_at`, [days]);
  return (rows[0] as { expires_at: Date | null } | undefined)?.expires_at ?? null;
}
