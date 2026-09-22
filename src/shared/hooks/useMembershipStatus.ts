/**
 * 会员状态查询 hook — 三态返回（planName / loading / error）
 * Membership Status Hook — Three-state return
 *
 * @module shared/hooks/useMembershipStatus
 * @description 从 features/membership/hooks 提升至 shared 层，
 *              消除 home → membership 跨 feature 硬依赖。
 *              P3 加固：补全 loading + error 状态，调用方可区分加载中 / 无套餐 / 加载失败。
 */
import { useState, useEffect } from "react";
import { api } from "@/core/http";

export interface UseMembershipStatusReturn {
  /** 当前套餐名称（null = 未登录或无套餐） */
  planName: string | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 加载错误（null = 成功或未请求） */
  error: string | null;
}

/**
 * 查询当前会员套餐名称（三态）
 * @param isLoggedIn - 用户是否已登录
 */
export function useMembershipStatus(isLoggedIn: boolean): UseMembershipStatusReturn {
  const [planName, setPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(isLoggedIn);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setPlanName(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api<{ current_plan_name: string | null }>("/api/membership/status")
      .then((data) => {
        setPlanName(data.current_plan_name);
        setError(null);
      })
      .catch((err) => {
        setPlanName(null);
        setError(err?.message ?? "Failed to fetch membership status");
      })
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  return { planName, loading, error };
}
