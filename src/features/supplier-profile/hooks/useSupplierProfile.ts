/**
 * 供应商详情页数据获取 Hook
 *
 * @module features/supplier-profile/hooks/useSupplierProfile
 * @description 按 ID 获取供应商详情，API 失败时降级到 mock 数据。
 */
import { useEffect, useState } from "react";
import { fetchSupplierById } from "@/features/supplier/api";
import type { Supplier } from "@/types";

export interface UseSupplierProfileReturn {
  supplier: Supplier | null;
  loading: boolean;
  error: string | null;
}

export function useSupplierProfile(lang: string, id: string): UseSupplierProfileReturn {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSupplierById(lang, id)
      .then((data) => {
        if (cancelled) return;
        setSupplier(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to fetch supplier");
        setSupplier(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lang, id]);

  return { supplier, loading, error };
}
