/**
 * 企业信息取数 Hook（企业表 supplier）
 * Enterprise Info Hook
 *
 * @module shared/hooks/useEnterpriseInfo
 * @description 调用 GET /api/user/enterprise（后端按 crm_users.supplier_id 关联
 *              supplier 企业表）获取当前用户企业信息。未绑定返回 bound=false。
 *              提供 loading/error/retry。
 *              架构解耦：原 features/auth/hooks 提升至 shared，供 auth/home/settings
 *              多方共享，消除 home→auth 跨 feature 硬依赖（红线 #3）。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/http";
import { onAppEvent } from "@/core/events";

/** 企业信息（supplier 整行透传，键为 snake_case 列名） */
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

  // 跨实例同步：身份两侧任一变更（企业绑定/解绑、供应商资源库增删）后，所有订阅者
  // （settings layout 排他显隐、home 顶部身份引导卡片）即时重取 bound，避免不及时排他。
  // 事件仅由写操作端点派发（非取数本身），不会形成回环。
  useEffect(() => {
    const offEnt = onAppEvent("supply-os:enterprise-changed", () => setNonce((n) => n + 1));
    const offPool = onAppEvent("supply-os:supplier-pool-changed", () => setNonce((n) => n + 1));
    return () => {
      offEnt();
      offPool();
    };
  }, []);

  return { bound, linkStatus, enterprise, loading, error, retry };
}
