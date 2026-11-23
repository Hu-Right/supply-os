"use client";

/**
 * 认领过期倒计时 Hook
 *
 * @module shared/hooks/useClaimExpiry
 * @description 查询当前用户对某供应商的认领状态与过期时间，并给出结构化剩余时长。
 *              供账户设置页、企业信息页共用的 ClaimExpiryBanner 消费。
 *              只输出数据不输出文案：时长字符串过去由本 Hook 拼「N天 N小时 已过期」，
 *              现在交给展示层按 locale 组装，过期与否也不再靠比对中文文案判断。
 *              时长计算不再另写一份：直接复用 shared/utils/countdown 的 getCountdown。
 *
 *              2026-11-23：同时下发 claim.status。此前只看 expiresAt，认领通过（approved）
 *              后若后台没清 expires_at，横幅会继续显示倒计时；上传执照后 7 天审核窗口
 *              也会被误当成「待上传」文案，出现「上面让上传、下面显示已上传」的自相矛盾。
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";
import { getCountdown, type CountdownResult } from "@/shared/utils/countdown";

export interface UseClaimExpiryReturn {
  /** 过期时间（Unix 毫秒，GET /api/supplier-claims 出口由北京墙钟串换算），无认领记录时为 null */
  claimExpiry: number | null;
  /** 认领状态：pending / approved / 其它（无记录为 null），展示层据此区分「待补资料 / 审核中 / 已通过」 */
  status: string | null;
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
  const [claimExpiry, setClaimExpiry] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<CountdownResult | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  // 获取过期时间
  useEffect(() => {
    if (!userId || !isBound || !supplierId) {
      setClaimExpiry(null);
      setStatus(null);
      setRemaining(null);
      setExpired(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        // GET /api/supplier-claims 直接出裸载荷（无认领记录为 null），字段 camelCase；
        // expiresAt 是 Unix 毫秒（服务端由北京墙钟串换算）——2026-11-20 事故前这里
        // 收过墙钟字符串，getCountdown 的 Number() 解析成 NaN 被误判「已过期」
        const res = await api<{ id: number; status: string; createdAt?: string; expiresAt?: number | null } | null>(
          `/api/supplier-claims?supplier_id=${supplierId}`,
        );
        setStatus(res?.status ?? null);
        if (res?.expiresAt) {
          setClaimExpiry(res.expiresAt);
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

  return { claimExpiry, status, remaining, expired, loading };
}
