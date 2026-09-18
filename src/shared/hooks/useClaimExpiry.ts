/**
 * 认领过期倒计时 Hook
 *
 * @module shared/hooks/useClaimExpiry
 * @description 查询当前用户对某供应商的认领过期时间，并提供实时倒计时。
 *              供账户设置页、企业信息页等共享使用，避免逻辑重复。
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";

export interface UseClaimExpiryReturn {
  /** 过期时间字符串（ISO），无认领记录时为 null */
  claimExpiry: string | null;
  /** 人类可读倒计时（如 "6天 12小时 30分钟"），过期后为 "已过期" */
  countdown: string;
  /** 是否正在加载 */
  loading: boolean;
}

export function useClaimExpiry(
  userId: number | undefined,
  supplierId: number | undefined,
  isBound: boolean,
): UseClaimExpiryReturn {
  const [claimExpiry, setClaimExpiry] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const [loading, setLoading] = useState(false);

  // 获取过期时间
  useEffect(() => {
    if (!userId || !isBound || !supplierId) {
      setClaimExpiry(null);
      setCountdown("");
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res: { data?: { expires_at?: string } } = await api(
          `/api/supplier-claims?supplier_id=${supplierId}`,
        );
        if (res.data?.expires_at) {
          setClaimExpiry(res.data.expires_at);
        } else {
          setClaimExpiry(null);
          setCountdown("");
        }
      } catch {
        // 忽略
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, isBound, supplierId]);

  // 倒计时定时器
  useEffect(() => {
    if (!claimExpiry) return;
    const updateCountdown = () => {
      const diff = new Date(claimExpiry).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("已过期");
        return false; // 停止
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${days}天 ${hours}小时 ${mins}分钟`);
      return true; // 继续
    };
    if (updateCountdown()) {
      const timer = setInterval(() => {
        if (!updateCountdown()) clearInterval(timer);
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [claimExpiry]);

  return { claimExpiry, countdown, loading };
}
