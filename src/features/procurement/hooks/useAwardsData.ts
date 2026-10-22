/**
 * 中标情报数据获取 hook
 * Awards Intelligence Data Hook
 *
 * @module features/procurement/hooks/useAwardsData
 * @description 从 /api/awards* 获取真实中标数据，供 award-intelligence 页面消费。
 *              三态严格区分（ARCHITECTURE.md 异常态要求）：
 *              - loading：初始 true，全部落定 false
 *              - error：任一请求 reject → true；成功返回（哪怕空库）→ false
 *              - empty：成功但 stats.total=0 → hasRealData=false（与 error 正交）
 *              旧实现用 .catch(()=>null) 把接口失败与库为空压成同一结果，用户无从区分
 *              「还没数据」与「出错了」——本版修复。走 apiCached（TTL 缓存 + 飞行中去重），
 *              对齐公开聚合端点约定；refetch 用 force 跳缓存做手动重试。
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiCached } from "@/core/http";
import { CACHE_TTL_STANDARD_MS } from "@/shared/constants/time";

// ── 类型定义 ──

export interface AwardStatsData {
  total: number;
  total_value_usd: number;
  by_agency: Array<{ agency: string; count: number; total_usd: number }>;
  by_country: Array<{ country: string; count: number }>;
  by_month: Array<{ month: string; count: number; total_usd: number }>;
  top_winners: Array<{ name: string; count: number; total_usd: number; country: string | null }>;
}

export interface AwardListItem {
  id: number;
  title: string;
  title_cn: string | null;
  reference: string | null;
  agency: string | null;
  country: string | null;
  award_date: string | null;
  contract_value_usd: number | null;
  currency: string;
  category: string | null;
  source_platform: string;
}

export interface AwardsData {
  stats: AwardStatsData | null;
  topWinners: Array<{ name: string; country: string | null; count: number; total_usd: number }>;
  recentAwards: AwardListItem[];
  hasRealData: boolean;
  loading: boolean;
  /** 任一请求失败（非空库）：与 hasRealData 正交，供页面区分「错误」与「空态」 */
  error: boolean;
}

/** hook 返回值：数据 + 手动重试 */
export interface UseAwardsDataReturn extends AwardsData {
  refetch: () => void;
}

const INITIAL: AwardsData = {
  stats: null,
  topWinners: [],
  recentAwards: [],
  hasRealData: false,
  loading: true,
  error: false,
};

/** 自动刷新间隔：15 分钟 */
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type TopResp = { items: Array<{ name: string; country: string | null; count: number; total_usd: number }> };
type ListResp = { items: AwardListItem[]; total: number };

/**
 * 中标情报数据 hook。并行请求 stats + top winners + recent awards：
 * 单点失败不阻断整体（部分成功仍渲染有数据的板块），但会把 error 置真供页面提示；
 * 全部成功但库为空 → hasRealData=false 且 error=false（诚实空态，非错误）。
 */
export function useAwardsData(): UseAwardsDataReturn {
  const [data, setData] = useState<AwardsData>(INITIAL);
  const mountedRef = useRef(true);

  const load = useCallback(async (force: boolean) => {
    let failed = false;
    // 逐请求兜底：失败标记 error 并回落空结构，但保留其它请求的真实结果（部分失败仍可渲染）
    const guard = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((e: unknown) => {
        failed = true;
        console.warn("[awards] 数据加载失败:", (e as Error)?.message ?? e);
        return fallback;
      });

    const [stats, topResp, listResp] = await Promise.all([
      guard(apiCached<AwardStatsData>("/api/awards/stats", CACHE_TTL_STANDARD_MS, undefined, force), null),
      guard(apiCached<TopResp>("/api/awards/top?limit=10", CACHE_TTL_STANDARD_MS, undefined, force), { items: [] }),
      guard(apiCached<ListResp>("/api/awards?page=1&page_size=10", CACHE_TTL_STANDARD_MS, undefined, force), { items: [], total: 0 }),
    ]);

    if (!mountedRef.current) return;
    const hasRealData = (stats?.total ?? 0) > 0;
    setData({
      stats,
      topWinners: topResp.items,
      recentAwards: listResp.items,
      hasRealData,
      loading: false,
      error: failed,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load(false);
    const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const refetch = useCallback(() => {
    setData((prev) => ({ ...prev, loading: true }));
    void load(true);
  }, [load]);

  return { ...data, refetch };
}
