/** 升级预览只读取新目录、当前订阅及真实账本。 */
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import type { UpgradePreview } from "@/types/membership";

export async function previewUpgrade(catalog: BenefitSystemRepo, userId: number, targetPlanCode: string): Promise<UpgradePreview> {
  const result: UpgradePreview = {
    can_upgrade: false, reason: null, current_plan: null, target_plan: null, subscription: null,
    quota_used: 0, price_difference: 0, remaining_after_upgrade: 0, expires_at_unchanged: true,
  };
  const target = await catalog.getPlan(targetPlanCode);
  result.target_plan = target;
  if (!target) return { ...result, reason: "TARGET_PLAN_NOT_FOUND" };
  if (Number(target.is_active) !== 1 || target.price_mode !== "fixed") return { ...result, reason: "TARGET_PLAN_NOT_UPGRADABLE" };
  const subscription = await catalog.findActivePlanForUser(userId);
  result.subscription = subscription;
  if (!subscription) return { ...result, reason: "NO_ACTIVE_PLAN" };
  if (subscription.seat_role !== "owner" || subscription.owner_user_id !== userId) return { ...result, reason: "SUBSCRIPTION_OWNER_REQUIRED" };
  if (subscription.plan_code === targetPlanCode) return { ...result, reason: "ALREADY_ON_TARGET_PLAN" };
  const current = await catalog.getPlan(subscription.plan_code);
  if (!current) throw new Error("PLAN_NOT_FOUND");
  result.current_plan = current;
  if (current.currency !== target.currency) return { ...result, reason: "CURRENCY_MISMATCH" };
  const difference = (Math.round(Number(target.price) * 100) - Math.round(Number(current.price) * 100)) / 100;
  if (!Number.isFinite(difference) || difference <= 0) return { ...result, reason: "CANNOT_DOWNGRADE" };
  const [cell, quotas] = await Promise.all([
    catalog.getCell(targetPlanCode, "notice_view"),
    catalog.listQuotaBalances(userId, subscription.subscription_id),
  ]);
  const pool = quotas.find(q => q.benefit_code === "notice_view");
  const total = Number(cell?.raw);
  if (!cell || !pool || !["active", "exhausted"].includes(pool.status) || !Number.isInteger(total) || total < -1 ||
      (total !== -1 && total < pool.quota_used)) return { ...result, reason: "UPGRADE_QUOTA_INVALID" };
  return { ...result, can_upgrade: true, price_difference: difference, quota_used: pool.quota_used,
    remaining_after_upgrade: total === -1 ? null : total - pool.quota_used };
}
