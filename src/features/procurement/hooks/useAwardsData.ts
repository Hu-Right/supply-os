/**
 * 中标情报数据获取 hook
 * Awards Intelligence Data Hook
 *
 * @module features/procurement/hooks/useAwardsData
 * @description 从 /api/awards/stats 和 /api/awards/top 获取真实中标数据，
 *              供 award-intelligence 页面消费。数据库为空时返回 null，
 *              页面可降级使用策展数据（UN ASR 报告）。
 */
import { useState, useEffect, useRef } from "react";
import { api } from "@/core/http";

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
}

const INITIAL: AwardsData = {
  stats: null,
  topWinners: [],
  recentAwards: [],
  hasRealData: false,
  loading: true,
};

/** 自动刷新间隔：15 分钟 */
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * 中标情报数据 hook
 *
 * 并行请求 stats + top winners + recent awards，
 * 数据库为空时 hasRealData=false，页面可降级到策展数据。
 */
export function useAwardsData(): AwardsData {
  const [data, setData] = useState<AwardsData>(INITIAL);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const fetchData = async () => {
      try {
        const [stats, topResp, listResp] = await Promise.all([
          api<AwardStatsData>("/api/awards/stats").catch(() => null),
          api<{ items: Array<{ name: string; country: string | null; count: number; total_usd: number }> }>("/api/awards/top?limit=10").catch(() => ({ items: [] })),
          api<{ items: AwardListItem[]; total: number }>("/api/awards?page=1&page_size=10").catch(() => ({ items: [], total: 0 })),
        ]);

        if (!mountedRef.current) return;

        const hasRealData = (stats?.total ?? 0) > 0;

        setData({
          stats,
          topWinners: topResp.items,
          recentAwards: listResp.items,
          hasRealData,
          loading: false,
        });
      } catch {
        // 静默失败：中标情报非关键路径
        if (mountedRef.current) {
          setData((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    fetchData();
    const timer = setInterval(fetchData, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  return data;
}
