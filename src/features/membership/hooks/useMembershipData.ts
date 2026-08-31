/**
 * 会员数据加载 Hook
 * Membership Data Loading Hook
 *
 * @module features/membership/hooks/useMembershipData
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { fetchPlans, fetchMembershipStatus } from "../api";
import type { MembershipPlan, MembershipStatus } from "@/types";

export interface UseMembershipDataReturn {
  plans: MembershipPlan[];
  membership: MembershipStatus | null;
  loading: boolean;
  error: string | null;
  /** 当前最优权益类型：subscription > entitlement */
  bestBenefitType: "subscription" | "entitlement" | "none";
  /** 单次解锁卡权益列表 */
  entitlements: MembershipStatus["entitlements"];
  /** 活跃订阅列表 */
  activeSubscriptions: MembershipStatus["active_subscriptions"];
  /** 总可用解锁次数（所有单次卡 + 订阅配额） */
  totalRemaining: number;
  /** 当前最优周期性套餐 code（升级判断依据） */
  currentPlanCode: string | null;
  /** 当前最优周期性套餐价格 */
  currentPlanPrice: number | null;
  /** 当前套餐名称 */
  currentPlanName: string | null;
  /** 当前套餐等级标签 */
  currentPlanTierLabel: string | null;
}

export function useMembershipData(): UseMembershipDataReturn {
  const { authUser } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([
      // 登录态强制跳过缓存：first_purchase_eligible 依赖登录态，
      // 复用未登录缓存会让 99/199 两卡同时出现（2026-08-30 修复）
      fetchPlans(Boolean(authUser)),
      // SSOT 修复：走 apiCached 与 useMembershipTier 共享同一份缓存，
      // 避免 MembershipPage 与 AppHeader 各发一次 /api/membership/status
      authUser ? fetchMembershipStatus(true).catch(() => null) : Promise.resolve(null),
    ])
      .then(([fetchedPlans, status]) => {
        if (!alive) return;
        const paidPlans = Array.isArray(fetchedPlans)
          ? fetchedPlans.filter((p) => p.plan_type !== "free")
          : [];
        setPlans(paidPlans);
        setMembership(status);
        setError(null);
      })
      .catch(() => {
        if (alive) {
          setError("套餐数据加载失败，请稍后重试");
          setPlans([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authUser]);

  const entitlements = membership?.entitlements ?? [];
  const activeSubscriptions = membership?.active_subscriptions ?? [];
  const bestBenefitType: "subscription" | "entitlement" | "none" =
    activeSubscriptions.length > 0
      ? "subscription"
      : entitlements.length > 0
        ? "entitlement"
        : "none";

  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  // 注意：paidRemaining（paid_quota_remaining）由后端从 entitlements 汇总得出，
  // 已包含所有单次解锁卡的剩余配额，不应再额外加 entitlementRemaining，否则会重复计算
  const totalRemaining = paidRemaining;

  return {
    plans,
    membership,
    loading,
    error,
    bestBenefitType,
    entitlements,
    activeSubscriptions,
    totalRemaining,
    currentPlanCode: membership?.current_plan_code ?? null,
    currentPlanPrice: membership?.current_plan_price ?? null,
    currentPlanName: membership?.current_plan_name ?? null,
    currentPlanTierLabel: membership?.current_plan_tier_label ?? null,
  };
}
