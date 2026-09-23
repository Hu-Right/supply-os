/** 会员状态直接来自当前生效订阅及其实际额度池。 */
import { FREE_PLAN_CODE, type BenefitSystemRepo } from "../repos/benefit-system.repo";
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
  return { plan, subscription, quotas, ...(gates ? { gates } : {}) };
}
