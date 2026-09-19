/**
 * 企业信息取数 Hook（企业表 crm_suppliers）
 * Enterprise Info Hook
 *
 * @module shared/hooks/useEnterpriseInfo
 * @description 调用 GET /api/user/enterprise（后端按 crm_users.supplier_id 关联
 *              crm_suppliers 企业表）获取当前用户企业信息。未绑定返回 bound=false。
 *              提供 loading/error/retry。
 *              架构解耦：原 features/auth/hooks 提升至 shared，供 auth/home/settings
 *              多方共享，消除 home→auth 跨 feature 硬依赖（红线 #3）。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/http";

/** 企业信息（crm_suppliers 整行透传，键为 snake_case 列名） */
export type EnterpriseInfo = Record<string, unknown>;

interface EnterpriseResponse {
  bound: boolean;
  linkStatus: string;
  enterprise: EnterpriseInfo | null;
}

export interface UseEnterpriseInfoReturn {
  bound: boolean;
  linkStatus: string;
  enterprise: EnterpriseInfo | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useEnterpriseInfo(): UseEnterpriseInfoReturn {
  const [bound, setBound] = useState(false);
  const [linkStatus, setLinkStatus] = useState("none");
  const [enterprise, setEnterprise] = useState<EnterpriseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ code: number; data: EnterpriseResponse }>("/api/user/enterprise")
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        setBound(!!d?.bound);
        setLinkStatus(d?.linkStatus || "none");
        setEnterprise(d?.enterprise ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setBound(false);
          setEnterprise(null);
          setError(e instanceof Error ? e.message : "load-failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { bound, linkStatus, enterprise, loading, error, retry };
}
