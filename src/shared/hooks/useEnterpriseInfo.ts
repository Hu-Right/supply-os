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
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/core/http";
import { onAppEvent } from "@/core/events";
import { useUserId } from "@/core/auth/useUserId";

/** 企业信息（supplier 整行透传，键为 snake_case 列名） */
export type EnterpriseInfo = Record<string, unknown>;

/** 换照审核进展（闭环前台状态源，GET /api/user/enterprise 随企业行一并返回） */
export interface LicenseChangeBrief {
  id: number;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  createdAt: string | null;
}

/** 自报主营品目回填报子（GET /api/user/enterprise 随企业行一并返回；取 source='self_report' 落点） */
export interface CommodityNodeBrief {
  code: string;
  nameZh: string;
}

interface EnterpriseResponse {
  bound: boolean;
  linkStatus: string;
  enterprise: EnterpriseInfo | null;
  licenseChange?: LicenseChangeBrief | null;
  /** 当前绑定主体已自报的品目节点（无绑定/读失败为空数组） */
  commodityNodes?: CommodityNodeBrief[];
}

export interface UseEnterpriseInfoReturn {
  bound: boolean;
  linkStatus: string;
  enterprise: EnterpriseInfo | null;
  /** 该企业最近一条换照变更；从未换过照为 null */
  licenseChange: LicenseChangeBrief | null;
  /** 当前绑定主体已自报的品目节点（编辑页回填用） */
  commodityNodes: CommodityNodeBrief[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useEnterpriseInfo(): UseEnterpriseInfoReturn {
  const userId = useUserId();
  const [bound, setBound] = useState(false);
  const [linkStatus, setLinkStatus] = useState("none");
  const [enterprise, setEnterprise] = useState<EnterpriseInfo | null>(null);
  const [licenseChange, setLicenseChange] = useState<LicenseChangeBrief | null>(null);
  const [commodityNodes, setCommodityNodes] = useState<CommodityNodeBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  /** 上一次取数身份：识别登录/登出/换号，换人时先清旧快照再重取 */
  const lastUserIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // 账号身份变化（登录/登出/切换账号）：先清掉上一账号的企业快照再重取。
    // 否则旧账号的「已认证」卡片会滞留到下一账号的页面上，与身份引导横幅串号，
    // 用户会看到「未绑定却提示已认证不能换绑」的自相矛盾状态。
    if (lastUserIdRef.current !== userId) {
      lastUserIdRef.current = userId;
      setBound(false);
      setLinkStatus("none");
      setEnterprise(null);
      setLicenseChange(null);
      setCommodityNodes([]);
    }
    // 未登录不取数（对齐 useHasSupplierPool 语义）：接口必然 401，徒增报错噪声
    if (userId === undefined) {
      setLoading(false);
      setError(null);
      return;
    }
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
        setLicenseChange(d?.licenseChange ?? null);
        setCommodityNodes(Array.isArray(d?.commodityNodes) ? d.commodityNodes : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setBound(false);
          setEnterprise(null);
          setLicenseChange(null);
          setCommodityNodes([]);
          setError(e instanceof Error ? e.message : "load-failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

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

  return { bound, linkStatus, enterprise, licenseChange, commodityNodes, loading, error, retry };
}
