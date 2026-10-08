/**
 * 认领过期倒计时 Hook
 *
 * @module shared/hooks/useClaimExpiry
 * @description 查询当前用户对某供应商的认领过期时间，并给出结构化剩余时长。
 *              供账户设置页、企业信息页共用的 ClaimExpiryBanner 消费。
 *              只输出数据不输出文案：时长字符串过去由本 Hook 拼「N天 N小时 已过期」，
 *              现在交给展示层按 locale 组装，过期与否也不再靠比对中文文案判断。
 *              时长计算不再另写一份：直接复用 shared/utils/countdown 的 getCountdown。
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";
import { getCountdown, type CountdownResult } from "@/shared/utils/countdown";

export interface UseClaimExpiryReturn {
  /** 过期时间字符串（ISO），无认领记录时为 null */
  claimExpiry: string | null;
  /** 剩余时长；无到期时间或已过期时为 null */
  remaining: CountdownResult | null;
  /** 认领是否已到期（到期即绑定已被后台自动解除）；到期时间不可解析时同样按已到期处理 */
  expired: boolean;
  /** 是否正在加载 */
  loading: boolean;
}

export function useClaimExpiry(
  userId: number | undefined,
  supplierId: number | undefined,
  isBound: boolean,
): UseClaimExpiryReturn {
  const [claimExpiry, setClaimExpiry] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<CountdownResult | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  // 获取过期时间
  useEffect(() => {
    if (!userId || !isBound || !supplierId) {
      setClaimExpiry(null);
      setRemaining(null);
      setExpired(false);
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
          setRemaining(null);
          setExpired(false);
        }
      } catch {
        // 忽略
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, isBound, supplierId]);

  // 倒计时：每分钟重算一次（到期后置 expired 并停止定时器）
  useEffect(() => {
    if (!claimExpiry) return;
    const tick = () => {
      const cd = getCountdown(claimExpiry);
      if (!cd) {
        setRemaining(null);
        setExpired(true);
        return false; // 停止
      }
      setExpired(false);
      setRemaining(cd);
      return true; // 继续
    };
    if (tick()) {
      const timer = setInterval(() => {
        if (!tick()) clearInterval(timer);
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [claimExpiry]);

  return { claimExpiry, remaining, expired, loading };
}
