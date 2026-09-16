/**
 * 会员状态查询 hook — 当前套餐名称
 * Membership Status Hook — Current plan name
 *
 * @module shared/hooks/useMembershipStatus
 * @description 从 features/membership/hooks 提升至 shared 层，
 *              消除 home → membership 跨 feature 硬依赖。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";

/**
 * 查询当前会员套餐名称
 * @param isLoggedIn - 用户是否已登录
 * @returns 当前套餐名称（null = 未登录或无套餐或加载失败）
 */
export function useMembershipStatus(isLoggedIn: boolean): string | null {
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setPlanName(null);
      return;
    }
    api<{ current_plan_name: string | null }>("/api/membership/status")
      .then((data) => setPlanName(data.current_plan_name))
      .catch(() => setPlanName(null));
  }, [isLoggedIn]);

  return planName;
}
