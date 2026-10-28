'use client';

/**
 * 订制服务目录数据 Hook — 读 /api/membership/services（service_catalog 快照）
 *
 * @module features/membership/hooks/useServiceCatalog
 * @description 走 fetchServices（apiCached）拉取启用中的服务目录；失败暴露 error + reload 供重试。
 */
import { useCallback, useEffect, useState } from "react";
import { fetchServices } from "@/core/api/membership";
import type { ServiceCatalogView } from "@/types/membership";

export function useServiceCatalog() {
  const [services, setServices] = useState<ServiceCatalogView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchServices();
      setServices(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { services, loading, error, reload };
}
