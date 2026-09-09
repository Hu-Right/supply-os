/**
 * 供应商统计数据 Hook
 * Supplier Stats Hook
 *
 * @module features/supplier/hooks/useSupplierStats
 * @description 获取供应商统计墙数据，支持自动刷新。
 */
import { useState, useEffect, useRef } from "react";
import { fetchSupplierStats, type SupplierStats } from "../api";

const INITIAL_STATS: SupplierStats = {
  searchable: 0,
  verified: 0,
  withCertification: 0,
  international: 0,
  registered: 0,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function useSupplierStats(): SupplierStats & { loading: boolean } {
  const [stats, setStats] = useState<SupplierStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStats = async () => {
      try {
        const data = await fetchSupplierStats();
        if (!mountedRef.current) return;
        setStats(data);
      } catch {
        // 静默失败
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  return { ...stats, loading };
}
