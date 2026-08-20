/**
 * 会员状态唯一判定端口（SSOT）
 * Membership state — Single Source of Truth
 *
 * @module server/services/membership-status
 * @description N1 收敛（2026-08-20）：原"用户是否 VIP / 配额余量"判定散落三处且口径不等价——
 *              ① auth.buildUserResponse 仅看订阅（hasActiveSubscription）
 *              ② membership.routes /status 看订阅 + 付费剩余配额
 *              ③ suppliers/contact.ts 看订阅 + 权益行
 *              导致仅购买单次解锁卡（entitlement）的用户在不同端点得到矛盾的 VIP 状态。
 *              现统一为 resolveMembershipState 单一端口：
 *              isVip = 有活跃订阅 OR 付费剩余配额 > 0（权益行已含 quota/有效期过滤，两式等价）。
 *              所有 VIP/配额派生状态必须经本函数获取，禁止再各自拼装查询。
 */
import type { MembershipRepo, CurrentBestPlanRow } from "../repos/membership.repo";
import type { SubscriptionRow, EntitlementRow } from "../repos/types";

/** 用户会员状态快照（免费/付费配额、订阅、权益、VIP 判定一次算清） */
export interface MembershipState {
  /** 统一 VIP 判定：有活跃订阅 OR 付费剩余配额 > 0 */
  isVip: boolean;
  /** 与前端 membership_tier 契约对齐 */
  tier: "free" | "vip";
  freeQuota: number;
  freeUsed: number;
  freeRemaining: number;
  paidUnlocks: number;
  /** 付费总配额 = 单次卡额度 + 订阅配额 */
  paidQuotaTotal: number;
  paidQuotaUsed: number;
  /** 付费剩余 = 单次卡剩余 + 订阅剩余（去重口径，见下方计算注释） */
  paidQuotaRemaining: number;
  entitlementRemaining: number;
  subscriptionQuota: number;
  subscriptionRemaining: number;
  activeSubscriptions: SubscriptionRow[];
  entitlements: EntitlementRow[];
  /** 当前最优周期性套餐（升级判断与等级标签展示用）；无付费状态时为 null */
  currentBest: CurrentBestPlanRow | null;
}

/**
 * 解析用户会员状态（唯一权威端口）。
 * 语义口径（历史三口径的并集收敛）：
 * - 订阅判定：crm_user_subscriptions status=active 且未过期；
 * - 权益判定：crm_user_entitlements status=active、未被升级替代、有剩余配额且未过期
 *   （MembershipRepo.findActiveEntitlements 已内置全部过滤，
 *   故"权益行存在"与"单次卡剩余 > 0"等价，无口径漂移空间）；
 * - isVip = 订阅存在 OR 付费剩余 > 0。
 */
export async function resolveMembershipState(
  membershipRepo: MembershipRepo,
  userKey: string,
): Promise<MembershipState> {
  // 五个无相互依赖的查询并行发起（与原 /status 端点串行口径一致，性能不回退）
  const [freeQuota, freeUsed, subs, paidUnlocks, entitlements] = await Promise.all([
    membershipRepo.getFreeQuota(),
    membershipRepo.countFreeUnlocks(userKey),
    membershipRepo.findActiveSubscriptions(userKey),
    membershipRepo.countPaidUnlocks(userKey),
    membershipRepo.findActiveEntitlements(userKey),
  ]);

  const paidQuotaTotal = entitlements.reduce((sum, item) => sum + Number(item.quota_total || 0), 0);
  const paidQuotaUsed = entitlements.reduce((sum, item) => sum + Number(item.quota_used || 0), 0);
  const entitlementRemaining = entitlements.reduce((sum, item) => sum + Number(item.quota_remaining || 0), 0);
  // 订阅配额：从活跃订阅的 plan unlock_quota 汇总，减去已使用的付费解锁次数
  const subscriptionQuota = subs.reduce((sum, sub) => sum + (Number(sub.unlock_quota) || 0), 0);
  const subscriptionRemaining = Math.max(0, subscriptionQuota - paidUnlocks);
  // 总付费剩余 = 单次卡剩余 + 订阅剩余
  const paidQuotaRemaining = entitlementRemaining + subscriptionRemaining;

  // 当前最优周期性套餐（供升级判断与 VIP 等级标签展示）
  const currentBest = await membershipRepo.findCurrentBestPlan(userKey);

  const isVip = subs.length > 0 || paidQuotaRemaining > 0;

  return {
    isVip,
    tier: isVip ? "vip" : "free",
    freeQuota,
    freeUsed,
    freeRemaining: Math.max(0, freeQuota - freeUsed),
    paidUnlocks,
    paidQuotaTotal: paidQuotaTotal + subscriptionQuota,
    paidQuotaUsed,
    paidQuotaRemaining,
    entitlementRemaining,
    subscriptionQuota,
    subscriptionRemaining,
    activeSubscriptions: subs,
    entitlements,
    currentBest,
  };
}
