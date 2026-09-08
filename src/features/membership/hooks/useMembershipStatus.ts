/**
 * 会员状态查询 hook — 当前套餐名称
 * Membership Status Hook — Current plan name
 *
 * @module features/membership/hooks/useMembershipStatus
 * @description 查询已登录用户的当前套餐名称（/api/membership/status）。
 *              仅登录时发起请求，未登录返回 null。
 *              api-client 缓存 5 分钟，无需客户端轮询。
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
