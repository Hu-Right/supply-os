/**
 * 检查用户是否已添加供应商到资源库
 * @module shared/hooks/useHasSupplierPool
 * @description 架构解耦：原 features/procurement/hooks 提升至 shared，供 home 与
 *              settings 多方共享，消除 home→procurement 跨 feature 硬依赖（红线 #3）。
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";

export function useHasSupplierPool(userId: number | undefined): { hasPool: boolean; loading: boolean } {
  const [hasPool, setHasPool] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setHasPool(false);
      setLoading(false);
      return;
    }
    api<{ list?: unknown[] }>("/api/user/supplier-pool")
      .then((res) => setHasPool(!!res?.list && res.list.length > 0))
      .catch(() => setHasPool(false))
      .finally(() => setLoading(false));
  }, [userId]);

  return { hasPool, loading };
}
