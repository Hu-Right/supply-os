/**
 * 公告会员配额 Hook
 * Notice Membership Hook
 *
 * @module features/procurement/hooks/useNoticeMembership
 * @description 会员状态与付费套餐加载、配额刷新与免费/付费配额剩余计算。
 *              Membership status & paid plan loading, quota refresh and
 *              free/paid remaining derivation.
 */
import { useEffect, useState } from "react";
import type { MembershipPlan, MembershipStatus } from "../types";
import { fetchMembershipPlans, fetchMembershipStatus } from "../api";

// 免费详情查看配额的兜底值（membership 未加载时使用）；
// 真实配额以后端 membership.free_quota 为准（源自 crm_membership_plans 表）
const FREE_QUOTA_FALLBACK = 3;

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
  refreshMembership: (useCache?: boolean) => Promise<void>;
  loadPaidPlans: () => Promise<void>;
}

export function useNoticeMembership({
  userKey,
  isVip,
}: UseNoticeMembershipOptions): UseNoticeMembershipReturn {
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<MembershipPlan[]>([]);

  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  const freeRemaining = Number(membership?.free_remaining ?? FREE_QUOTA_FALLBACK);
  const freeQuota = Number(membership?.free_quota ?? FREE_QUOTA_FALLBACK);
  const canUsePaidQuota = isVip || paidRemaining > 0;

  const refreshMembership = async (useCache = false) => {
    if (!userKey) {
      setMembership(null);
      return;
    }
    try {
      const data = await fetchMembershipStatus(userKey, useCache);
      setMembership(data);
    } catch {
      setMembership(null);
    }
  };

  // 套餐列表懒加载：仅在用户首次触发付费操作时才请求，避免初始页面加载时多发一个请求；
  // 套餐展示由后端 is_active 控制，前端不再硬编码过滤
  const loadPaidPlans = () => {
    if (paidPlans.length > 0) return Promise.resolve();
    return fetchMembershipPlans()
      .then((plans) =>
        setPaidPlans(Array.isArray(plans) ? plans : []),
      )
      .catch(() => {});
  };

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
    refreshMembership,
    loadPaidPlans,
  };
}
