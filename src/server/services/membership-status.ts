/**
 * 会员状态唯一判定端口（SSOT）
 * Membership state — Single Source of Truth
 *
 * @module server/services/membership-status
 * @description N1 收敛（2026-08-20）：原"用户是否 VIP / 配额余量"判定散落三处且口径不等价，
 *              现统一为本模块唯一端口。
 *
 *              §2.0 产品语义裁决（Phase 0.1，2026-08-20；见《VIP判定SSOT系统性方案设计.md》）：
 *              R1 身份与额度分离 —— VIP 是订阅身份，单次解锁卡只授予额度、不授予身份；
 *              R2 期限基准 —— VIP 按会员期限判定（订阅 active 且未过期），
 *                 配额耗尽不影响 VIP，到期自动失效；
 *              R3 免费用户 —— 无订阅即 free，免费预览额度与 VIP 无关。
 *
 *              判定表达式：isVip = 存在期限内活跃订阅（findActiveSubscriptions 已内置
 *              status='active' 与 expires_at 期限过滤，恰为 R2 的数据原语实现）。
 *              语义固化测试：membership-status.test.ts（7 画像，画像 2/4 为反直觉断言）。
 *              所有 VIP/配额派生状态必须经本函数获取，禁止再各自拼装查询。
 */
import "server-only";
import type { MembershipRepo, CurrentBestPlanRow } from "../repos/membership.repo";
import type { SubscriptionRow, EntitlementRow } from "../repos/types";

/** 用户会员状态快照（免费/付费配额、订阅、权益、VIP 判定一次算清） */
export interface MembershipState {
  /** 统一 VIP 判定：期限内活跃订阅（§2.0 R1/R2：单次卡不授予身份，配额耗尽不影响身份） */
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
 *
 * VIP 判定语义（§2.0 裁决，勿擅改；修订须先更新裁决文档与固化测试）：
 * - isVip = findActiveSubscriptions 结果非空（期限内活跃订阅，期限基准 R2）；
 * - 单次卡（entitlements）不参与 VIP 判定，仅计入配额字段（身份与额度分离 R1）；
 * - 配额字段（paidQuotaRemaining 等）服务解锁消费与展示，与 VIP 判定无关。
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

  // §2.0 裁决（Phase 0.1，2026-08-20）：期限基准，与额度解耦——
  // R1 单次卡（entitlements）不授予 VIP；R2 配额耗尽不剥夺期限内订阅的 VIP。
  const isVip = subs.length > 0;

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
