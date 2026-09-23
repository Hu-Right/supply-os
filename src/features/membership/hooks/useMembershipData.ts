/**
 * 会员数据加载 Hook（新权益体系）
 * Membership Data Loading Hook
 *
 * @module features/membership/hooks/useMembershipData
 * @description 拉取服务端解析好的对比矩阵（六卡 + 逐格权益）与当前会员状态；
 *              派生升级判断所需的当前订阅 code/price 与剩余解锁次数。
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { fetchPlans, fetchMembershipStatus } from "../api";
import { unlockRemaining } from "@/shared/utils/membership-view";
import type { ComparisonTable, MembershipStatus, PlanCatalogRow } from "@/types";

export interface UseMembershipDataReturn {
  /** 六卡商品行（来自对比矩阵 plans 列，服务端已排除 free） */
  plans: PlanCatalogRow[];
  /** 完整对比矩阵（各卡按 plan_code 取自身列渲染权益 chip） */
  comparison: ComparisonTable | null;
  membership: MembershipStatus | null;
  loading: boolean;
  error: string | null;
  /** 总可用解锁次数（额度账本 notice_view 池，"不限"归一为 9999） */
  totalRemaining: number;
  /** 当前有效订阅套餐 code（无订阅 = null，升级判断依据） */
  currentPlanCode: string | null;
  /** 当前有效订阅套餐价格（升级差价计算依据） */
  currentPlanPrice: number | null;
  /** 当前生效套餐名称（含普通用户 free 档） */
  currentPlanName: string | null;
}

export function useMembershipData(): UseMembershipDataReturn {
  const { authUser } = useAuth();
  const [plans, setPlans] = useState<PlanCatalogRow[]>([]);
  const [comparison, setComparison] = useState<ComparisonTable | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([
      // 登录态强制跳过缓存：确保拿到与当前身份一致的视图（V2）
      fetchPlans(Boolean(authUser)),
      // SSOT 修复：走 apiCached 与 useMembershipTier 共享同一份缓存，
      // 避免 MembershipPage 与 AppHeader 各发一次 /api/membership/status
      authUser ? fetchMembershipStatus(true).catch(() => null) : Promise.resolve(null),
    ])
      .then(([table, status]) => {
        if (!alive) return;
        setComparison(table ?? null);
        setPlans(Array.isArray(table?.plans) ? table.plans : []);
        setMembership(status);
        setError(null);
      })
      .catch(() => {
        if (alive) {
          setError("套餐数据加载失败，请稍后重试");
          setPlans([]);
          setComparison(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authUser]);

  // 升级判断以「当前有效订阅」为准；普通用户（无订阅）不进入升级差价路径。
  const hasSubscription = Boolean(membership?.subscription);
  const currentPlanCode = hasSubscription ? membership?.plan.plan_code ?? null : null;
  const currentPlanPrice = hasSubscription ? Number(membership?.plan.price) : null;

  return {
    plans,
    comparison,
    membership,
    loading,
    error,
    totalRemaining: unlockRemaining(membership?.quotas),
    currentPlanCode,
    currentPlanPrice,
    currentPlanName: membership?.plan?.name_zh ?? null,
  };
}
