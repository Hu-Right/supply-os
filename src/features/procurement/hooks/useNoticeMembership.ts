/**
 * 公告会员配额 Hook
 * Notice Membership Hook
 *
 * @module features/procurement/hooks/useNoticeMembership
 * @description 会员状态与付费套餐加载、配额刷新与免费/付费配额剩余计算。
 *              Membership status & paid plan loading, quota refresh and
 *              free/paid remaining derivation.
 */
import { useCallback, useEffect, useState } from "react";
import type { MembershipPlan, MembershipStatus } from "../types";
import { fetchMembershipPlans, fetchMembershipStatus } from "../api";

// P3-17 安全修复：免费配额兆底值为 0，防止后端接口异常时前端硬编码的 3 次免费额度被误用；
// 真实配额以后端 membership.free_quota 为准（源自 crm_membership_plans 表），
// 接口未返回时 freeRemaining/freeQuota 均为 0，不产生任何免费查看权限。
const FREE_QUOTA_FALLBACK = 0;

export interface UseNoticeMembershipOptions {
  /** 当前登录用户 key */
  userKey: string | undefined;
  /** 是否 VIP（决定免费配额门槛与解锁类型） */
  isVip: boolean;
}

export interface UseNoticeMembershipReturn {
  membership: MembershipStatus | null;
  paidPlans: MembershipPlan[];
  paidRemaining: number;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  /** 当前最优权益类型：subscription > entitlement > free */
  bestBenefitType: "subscription" | "entitlement" | "free";
  /** 单次解锁卡权益列表 */
  entitlements: MembershipStatus["entitlements"];
  /** 活跃订阅列表 */
  activeSubscriptions: MembershipStatus["active_subscriptions"];
  /** 总可用解锁次数（免费 + 所有单次卡 + 订阅配额） */
  totalRemaining: number;
  refreshMembership: (useCache?: boolean) => Promise<void>;
  /** 懒加载付费套餐列表（P1-10：返回套餐数组供调用方动态取码/取价） */
  loadPaidPlans: () => Promise<MembershipPlan[]>;
}

export function useNoticeMembership({
  userKey,
  isVip,
}: UseNoticeMembershipOptions): UseNoticeMembershipReturn {
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<MembershipPlan[]>([]);

  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  // P3-17：后端下发优先；membership 未加载时兆底为 0（接口异常时不产生免费权限）
  const freeRemaining = Number(membership?.free_remaining ?? FREE_QUOTA_FALLBACK);
  const freeQuota = Number(membership?.free_quota ?? FREE_QUOTA_FALLBACK);
  const canUsePaidQuota = isVip || paidRemaining > 0;

  // 权益列表（直接从 membership 透传，供 UI 组件消费）
  const entitlements = membership?.entitlements ?? [];
  const activeSubscriptions = membership?.active_subscriptions ?? [];

  // 综合展示优先级：订阅 > 单次卡 > 免费
  const bestBenefitType: "subscription" | "entitlement" | "free" =
    activeSubscriptions.length > 0
      ? "subscription"
      : entitlements.length > 0
        ? "entitlement"
        : "free";

  // 总可用解锁次数 = 免费剩余 + 付费剩余
  // 注意：paidRemaining（paid_quota_remaining）由后端从 entitlements 汇总得出，
  // 已包含所有单次解锁卡的剩余配额，不应再额外加 entitlementRemaining，否则会重复计算
  const totalRemaining = freeRemaining + paidRemaining;

  // P2-2：useCallback 稳定引用，配合下游 openNotice 的 memo 化不击穿 NoticeCard
  const refreshMembership = useCallback(async (useCache = false) => {
    if (!userKey) {
      setMembership(null);
      return;
    }
    try {
      // B1 legacy 退役：身份由 JWT 承载，user_key 兜底参数已删除
      const data = await fetchMembershipStatus(useCache);
      setMembership(data);
    } catch {
      setMembership(null);
    }
  }, [userKey]);

  // 套餐列表懒加载：仅在用户首次触发付费操作时才请求，避免初始页面加载时多发一个请求；
  // 套餐展示由后端 is_active 控制，前端不再硬编码过滤
  // 过滤 plan_type === 'manual' 的套餐（人工顾问服务），此类套餐仅在会员专区展示，
  // 不出现在采购详情页的自助支付面板中
  // P1-10 修复：返回套餐数组（而非 void），供 handlePayUnlock 动态取 single 套餐的 code/price
  // P2-2：useCallback 稳定引用
  const loadPaidPlans = useCallback((): Promise<MembershipPlan[]> => {
    if (paidPlans.length > 0) return Promise.resolve(paidPlans);
    return fetchMembershipPlans()
      .then((plans) => {
        const list = Array.isArray(plans)
          ? plans.filter((p) => p.plan_type !== "manual")
          : [];
        setPaidPlans(list);
        return list;
      })
      .catch(() => [] as MembershipPlan[]);
  }, [paidPlans]);

  useEffect(() => {
    refreshMembership(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey, isVip]);

  return {
    membership,
    paidPlans,
    paidRemaining,
    freeRemaining,
    freeQuota,
    canUsePaidQuota,
    bestBenefitType,
    entitlements,
    activeSubscriptions,
    totalRemaining,
    refreshMembership,
    loadPaidPlans,
  };
}
