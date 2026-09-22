/**
 * 首页规模数据统一获取 hook — 多组件共享，消除重复 API 调用
 * Home Stats Hook — Unified data fetching for homepage scale indicators
 *
 * @module features/home/hooks/useHomeStats
 * @description StatsWall 与 AboutSection 原先各自独立调用相同的 3 个 API
 *              （/api/notices/stats、/api/notices/countries、/api/suppliers），
 *              导致首屏 6 个冗余请求。提取为统一 hook 后：
 *              - api-client 飞行中去重确保同一时刻只发 1 次请求
 *              - 10 分钟自动刷新逻辑只维护一份
 *              - 数据一致性由单一 state 保证
 */
import { useState, useEffect, useRef } from "react";
import { api } from "@/core/http";

export interface HomeStatsData {
  /** 采购机会总量 */
  noticeActive: number;
  /** 今日新增机会 */
  noticeTodayNew: number;
  /** 覆盖国家/地区数 */
  countryCount: number;
  /** 认证供应商数量 */
  certifiedSupplierCount: number;
  /** 国家商机明细（供 WorldMapChart 使用，避免重复请求） */
  countries: Array<{ country: string; count: number }>;
}

const INITIAL_STATS: HomeStatsData = {
  noticeActive: 0,
  noticeTodayNew: 0,
  countryCount: 0,
  certifiedSupplierCount: 0,
  countries: [],
};

/** 自动刷新间隔：10 分钟 */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 首页规模数据 hook — 统一获取 stats/countries/suppliers，
 * 多组件共享同一数据源，api-client 飞行中去重避免重复请求。
 */
export function useHomeStats(): HomeStatsData & { loading: boolean } {
  const [stats, setStats] = useState<HomeStatsData>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStats = async () => {
      try {
        const [noticeData, countries, suppliers] = await Promise.all([
          api<{ active: number; todayNew: number }>("/api/notices/stats"),
          api<Array<{ country: string; count: number }>>("/api/notices/countries"),
          api<{ total: number }>("/api/suppliers?page=1&pageSize=1&status=approved"),
        ]);

        if (!mountedRef.current) return;

        setStats({
          noticeActive: noticeData.active,
          noticeTodayNew: noticeData.todayNew ?? 0,
          countryCount: countries.length,
          certifiedSupplierCount: suppliers.total ?? 0,
          countries,
        });
      } catch {
        // 静默失败：首页统计非关键路径，保持上一次的值
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
