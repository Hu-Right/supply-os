/**
 * 检查用户是否已添加供应商到资源库
 * @module shared/hooks/useHasSupplierPool
 * @description 架构解耦：原 features/procurement/hooks 提升至 shared，供 home 与
 *              settings 多方共享，消除 home→procurement 跨 feature 硬依赖（红线 #3）。
 *              取数语义与 useEnterpriseInfo 保持一致：cancelled 守卫防卸载后 setState、
 *              暴露 error/retry；catch 不再粗暴置 hasPool=false，避免瞬时失败把
 *              "已建资源库"误判为"未建"而藏错 Tab（显隐交由调用方按 loading/error 兜底）。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/http";
import { onAppEvent } from "@/core/events";

export function useHasSupplierPool(userId: number | undefined): {
  hasPool: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [hasPool, setHasPool] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) {
      setHasPool(false);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ data?: { list?: unknown[] } }>("/api/user/supplier-pool")
      .then((res) => {
        if (cancelled) return;
        // 后端为信封返回 { code, message, data: { list } }，须读 data.list（勿读顶层 res.list）
        const list = res?.data?.list;
        setHasPool(!!list && list.length > 0);
      })
      .catch((e) => {
        if (cancelled) return;
        // 不重置 hasPool：保留上一次成功值，交由调用方在 loading/error 期间兜底显隐
        setError(e instanceof Error ? e.message : "load-failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  // 跨实例同步：身份两侧任一变更（供应商资源库增删、企业绑定/解绑）后，所有订阅者
  // （settings layout 排他显隐、home 顶部身份引导卡片）即时重取，避免绑定后不及时排他、卡片常驻需刷新。
  // 事件仅由写操作端点派发（非取数本身），不会形成回环。
  useEffect(() => {
    const offPool = onAppEvent("supply-os:supplier-pool-changed", () => setNonce((n) => n + 1));
    const offEnt = onAppEvent("supply-os:enterprise-changed", () => setNonce((n) => n + 1));
    return () => {
      offPool();
      offEnt();
    };
  }, []);

  return { hasPool, loading, error, retry };
}
