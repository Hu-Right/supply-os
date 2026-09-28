/** 会员状态直接来自当前生效订阅及其实际额度池。 */
import { FREE_PLAN_CODE, type BenefitSystemRepo } from "../repos/benefit-system.repo";
import { resolveUpgradeCreditWindow } from "./membership-upgrade";
import type { MembershipStatus } from "@/types/membership";

export async function resolveMembershipState(
  catalog: BenefitSystemRepo,
  userId: number,
  withGates = false,
): Promise<MembershipStatus> {
  const subscription = await catalog.findActivePlanForUser(userId);
  const [plan, quotas, gates] = await Promise.all([
    catalog.getPlan(subscription?.plan_code ?? FREE_PLAN_CODE),
    catalog.listQuotaBalances(subscription?.owner_user_id ?? userId, subscription?.subscription_id ?? null),
    // 仅详情页等需要时才按矩阵算门控状态（多一次全矩阵读）；auth 热路径不拉 gates。
    withGates ? catalog.resolveGates(userId) : Promise.resolve(undefined),
  ]);
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  // 升级全额抵扣窗口：判定口径与 previewUpgrade 同一个纯函数（两处算出不同结果就等于对客反悔），
  // 只在档位真的声明了窗口时才下发——前端据此决定卡片是「升级补差价」还是「按原价新购」，
  // 无需把 7 天/档位常量抄进客户端（热路径多了一次 Date 比较，不额外查库）。
  const creditWindow = resolveUpgradeCreditWindow(subscription?.started_at, plan.upgrade_credit_days);

  return {
    plan,
    subscription,
    quotas,
    ...(gates ? { gates } : {}),
    ...(plan.upgrade_credit_days != null && creditWindow.constrained
      ? { upgrade_credit: { days: plan.upgrade_credit_days, open: creditWindow.open, deadline_at: creditWindow.deadlineAt } }
      : {}),
  };
}
