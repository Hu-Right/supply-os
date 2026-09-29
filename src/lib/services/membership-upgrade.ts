/**
 * 升级预览：新目录 + 当前订阅 + 真实账本，并按目录属性判定「全额抵扣」资格。
 *
 * @module lib/services/membership-upgrade
 * @description 抵扣口径来自 260928 报价表（落在 crm_plan_catalog.upgrade_credit_days，迁移 104）：
 *              - 档位声明了窗口（129/999＝7 天）：自订阅生效起 N 天内升级 = 已付款全额抵扣（补差价）；
 *                超窗口**不再有抵扣路径**——返回 UPGRADE_CREDIT_WINDOW_CLOSED 与原价新购金额，
 *                因为升级履约会把旧订阅置为被替代并冻结其额度池，若让它按原价走 upgrade 单，
 *                客户既付了全款又丢掉剩余有效期，属对客资金损失，必须改走 order_type=new 新购；
 *              - 档位未声明窗口（NULL，如 1299）：文档没写抵扣，沿用既有「补差价升级」，不收紧。
 *              「仅限 1 次」无需状态位：performUpgradeInTransaction 要求来源订阅
 *              replaced_by_id IS NULL，一次抵扣升级即消耗掉该次付款的升级资格。
 */
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { ActivePlanRow, UpgradePreview } from "@/types/membership";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpgradeCreditWindow {
  /** 本档是否声明了抵扣窗口（false=文档未承诺抵扣，沿用补差价）。 */
  constrained: boolean;
  /** 窗口是否仍开着；不声明窗口的档恒为 true。 */
  open: boolean;
  /** 窗口截止时间 ISO；不声明窗口或时间不可解析时为 null。 */
  deadlineAt: string | null;
}

/**
 * 判定抵扣窗口。started_at 不可解析时保守判为「窗口外」：宁可不给出抵扣报价（客户按原价新购，
 * 权益不受损），也不能凭坏数据白送抵扣。
 */
export function resolveUpgradeCreditWindow(
  startedAt: ActivePlanRow["started_at"] | null | undefined,
  days: number | null | undefined,
): UpgradeCreditWindow {
  if (days == null) return { constrained: false, open: true, deadlineAt: null };
  const started = new Date(startedAt as string | Date).getTime();
  if (!Number.isFinite(started)) return { constrained: true, open: false, deadlineAt: null };
  const deadline = new Date(started + days * DAY_MS);
  return { constrained: true, open: Date.now() <= deadline.getTime(), deadlineAt: deadline.toISOString() };
}

export async function previewUpgrade(catalog: BenefitSystemRepo, userId: number, targetPlanCode: string): Promise<UpgradePreview> {
  const result: UpgradePreview = {
    can_upgrade: false, reason: null, current_plan: null, target_plan: null, subscription: null,
    quota_used: 0, price_difference: 0, remaining_after_upgrade: 0, expires_at_unchanged: true,
    credit_days: null, credit_deadline_at: null, new_purchase_price: null,
  };
  const target = await catalog.getPlan(targetPlanCode);
  result.target_plan = target;
  if (!target) return { ...result, reason: "TARGET_PLAN_NOT_FOUND" };
  if (Number(target.is_active) !== 1 || target.price_mode !== "fixed") return { ...result, reason: "TARGET_PLAN_NOT_UPGRADABLE" };
  const subscription = await catalog.findActivePlanForUser(userId);
  result.subscription = subscription;
  if (!subscription) return { ...result, reason: "NO_ACTIVE_PLAN" };
  if (subscription.plan_code === targetPlanCode) return { ...result, reason: "ALREADY_ON_TARGET_PLAN" };
  const current = await catalog.getPlan(subscription.plan_code);
  if (!current) throw new Error("PLAN_NOT_FOUND");
  result.current_plan = current;
  if (current.currency !== target.currency) return { ...result, reason: "CURRENCY_MISMATCH" };

  // ── 抵扣窗口闸口（先于差价：窗口外根本不给 upgrade 单） ──
  const creditWindow = resolveUpgradeCreditWindow(subscription.started_at, current.upgrade_credit_days);
  const creditFields = {
    credit_days: current.upgrade_credit_days ?? null,
    credit_deadline_at: creditWindow.deadlineAt,
  };
  if (!creditWindow.open) {
    const full = Number(target.price);
    return { ...result, ...creditFields, reason: "UPGRADE_CREDIT_WINDOW_CLOSED", price_difference: full, new_purchase_price: full };
  }

  const difference = (Math.round(Number(target.price) * 100) - Math.round(Number(current.price) * 100)) / 100;
  if (!Number.isFinite(difference) || difference <= 0) return { ...result, ...creditFields, reason: "CANNOT_DOWNGRADE" };
  const [cell, quotas] = await Promise.all([
    catalog.getCell(targetPlanCode, "notice_view"),
    catalog.listQuotaBalances(userId, subscription.subscription_id),
  ]);
  const pool = quotas.find(q => q.benefit_code === "notice_view");
  const total = Number(cell?.raw);
  if (!cell || !pool || !["active", "exhausted"].includes(pool.status) || !Number.isInteger(total) || total < -1 ||
      (total !== -1 && total < pool.quota_used)) return { ...result, ...creditFields, reason: "UPGRADE_QUOTA_INVALID" };
  return {
    ...result, ...creditFields,
    can_upgrade: true, price_difference: difference, quota_used: pool.quota_used,
    remaining_after_upgrade: total === -1 ? null : total - pool.quota_used,
  };
}
