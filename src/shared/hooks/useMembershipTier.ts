/**
 * 会员等级标签 Hook
 * Membership Tier Label Hook
 *
 * @module shared/hooks/useMembershipTier
 * @description 从 features/membership/hooks 提升至 shared 层，
 *              消除 auth → membership 跨 feature 硬依赖。
 *              带 TTL 缓存，避免多组件并发重复请求。
 */
import { useEffect, useState } from "react";
import { apiCached } from "@/core/http";
import { useAuth } from "@/core/auth";
import type { MembershipStatus } from "@/types";

export interface UseMembershipTierReturn {
  /** 等级标签（个人版/基础版/旗舰版/至尊版），无套餐或兜底时为空串由调用方回退 VIP */
  tierLabel: string;
  /** 当前套餐 code */
  currentPlanCode: string | null;
  /** 当前套餐价格（升级差价计算依据） */
  currentPlanPrice: number | null;
  /** 当前套餐名称 */
  currentPlanName: string | null;
}

/** 缓存有效期：1 分钟（等级变化后刷新页面即可更新） */
const TIER_CACHE_TTL = 60_000;

export function useMembershipTier(): UseMembershipTierReturn {
  const { authUser } = useAuth();
  const [status, setStatus] = useState<MembershipStatus | null>(null);

  useEffect(() => {
    if (!authUser) {
      setStatus(null);
      return;
    }
    let alive = true;
    apiCached<MembershipStatus>(
      // B1 legacy 退役：user_key 兜底参数已删除，身份由 JWT 承载
      "/api/membership/status",
      TIER_CACHE_TTL,
    )
      .then((data) => {
        if (alive) setStatus(data);
      })
      .catch((e) => {
        console.warn("[MembershipTier] 会员等级查询失败:", e);
        if (alive) setStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [authUser]);

  // 新体系：会员状态 = { plan, subscription, quotas }；普通用户（无订阅）不算 VIP。
  const hasSubscription = Boolean(status?.subscription);
  return {
    tierLabel: hasSubscription ? status?.plan.name_zh || "" : "",
    currentPlanCode: hasSubscription ? status?.plan.plan_code ?? null : null,
    currentPlanPrice: hasSubscription ? Number(status?.plan.price) : null,
    currentPlanName: status?.plan?.name_zh ?? null,
  };
}
