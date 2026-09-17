/**
 * 企业信息取数 Hook
 * Enterprise Info Hook
 *
 * @module features/auth/hooks/useEnterpriseInfo
 * @description 按当前用户绑定的 supplier_id 拉取供应商目录信息（复用公开端点
 *              GET /api/suppliers/[id]，返回裸 Supplier DTO）。supplier_id 为空
 *              （未绑定）时不发请求直接 supplier=null。提供 loading/error/retry。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/http";
import type { Supplier } from "@/types";

export interface UseEnterpriseInfoReturn {
  /** 已绑定供应商信息；未绑定或加载失败为 null */
  supplier: Supplier | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useEnterpriseInfo(supplierId: number | undefined): UseEnterpriseInfoReturn {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // 未绑定供应商：不发请求
    if (!supplierId) {
      setSupplier(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<Supplier>(`/api/suppliers/${supplierId}`)
      .then((d) => {
        if (!cancelled) setSupplier(d ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setSupplier(null);
          setError(e instanceof Error ? e.message : "load-failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { supplier, loading, error, retry };
}
