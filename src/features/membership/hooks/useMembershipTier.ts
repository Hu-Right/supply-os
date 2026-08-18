/**
 * 会员等级标签 Hook
 * Membership Tier Label Hook
 *
 * @module features/membership/hooks/useMembershipTier
 * @description 拉取用户当前最优周期性套餐并提取等级标签（个人版/基础版/旗舰版/至尊版），
 *              供头部胶囊、移动抽屉、账号面板等全局位置展示 VIP 等级。
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
      `/api/membership/status?user_key=${encodeURIComponent(authUser.user_key)}`,
      TIER_CACHE_TTL,
    )
      .then((data) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        if (alive) setStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [authUser]);

  return {
    tierLabel: status?.current_plan_tier_label || "",
    currentPlanCode: status?.current_plan_code ?? null,
    currentPlanPrice: status?.current_plan_price ?? null,
    currentPlanName: status?.current_plan_name ?? null,
  };
}
