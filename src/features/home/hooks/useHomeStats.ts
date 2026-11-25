/**
 * 首页规模数据统一获取 hook — 多组件共享，消除重复 API 调用
 * Home Stats Hook — Unified data fetching for homepage scale indicators
 *
 * @module features/home/hooks/useHomeStats
 * @description StatsWall 与 AboutSection 原先各自独立调用相同的 3 个 API
 *              （/api/notices/stats、/api/notices/countries、/api/suppliers/stats），
 *              导致首屏 6 个冗余请求。提取为统一 hook 后：
 *              - 走 apiCached()：模块级 TTL 缓存 + 飞行中去重，
 *                多个组件实例同帧挂载时同一端点只发 1 次真实请求
 *              - 10 分钟自动刷新逻辑只维护一份
 *              - 数据一致性由单一 state 保证
 */
import { useState, useEffect, useRef } from "react";
import { apiCached } from "@/core/http";

export interface HomeStatsData {
  /** 采购机会总量 */
  noticeActive: number;
  /** 今日新增机会 */
  noticeTodayNew: number;
  /** 覆盖国家/地区数（服务表 country_code 主国家口径，来自 /api/notices/stats） */
  countryCount: number;
  /** 认证供应商数量 */
  certifiedSupplierCount: number;
  /** 库内供应商总数（全部审核状态，首页数字墙口径） */
  supplierTotal: number;
  /** 国家商机明细（供 WorldMapChart 使用，避免重复请求） */
  countries: Array<{ country: string; count: number }>;
}

const INITIAL_STATS: HomeStatsData = {
  noticeActive: 0,
  noticeTodayNew: 0,
  countryCount: 0,
  certifiedSupplierCount: 0,
  supplierTotal: 0,
  countries: [],
};

/** 自动刷新间隔：10 分钟 */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 首页规模数据 hook — 统一获取 stats/countries/suppliers，
 * 多组件共享同一数据源，apiCached 的 TTL 缓存 + 飞行中去重避免重复请求。
 *
 * @param initial 服务端直出初值（ISR 注入的 HomeSnapshot）：命中时首帧即真实
 * 数字且 loading=false；后台刷新照常执行，接管 10 分钟轮询。
 */
export function useHomeStats(initial?: Partial<HomeStatsData>): HomeStatsData & { loading: boolean; resolved: boolean } {
  const [stats, setStats] = useState<HomeStatsData>(() => ({ ...INITIAL_STATS, ...initial }));
  const [loading, setLoading] = useState(initial === undefined);
  /** 是否已拿到可信数据：快照/接口都失败时为 false，展示层据此显示「—」而不是假 0 */
  const [resolved, setResolved] = useState(initial !== undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStats = async () => {
      try {
        const [noticeData, countries, supplierStats] = await Promise.all([
          apiCached<{ active: number; todayNew: number; countryCount?: number }>("/api/notices/stats"),
          apiCached<Array<{ country: string; count: number }>>("/api/notices/countries"),
          // 数字墙要「供应商总数」，AboutSection 要「认证供应商」，两者同端点一次取回：
          // total=全表口径，searchable=已审通过的目录口径（原 list 分支的 total）
          apiCached<{ total: number; searchable: number }>("/api/suppliers/stats"),
        ]);

        if (!mountedRef.current) return;

        setStats({
          noticeActive: noticeData.active,
          noticeTodayNew: noticeData.todayNew ?? 0,
          countryCount: noticeData.countryCount ?? countries.length,
          certifiedSupplierCount: supplierStats.searchable ?? 0,
          supplierTotal: supplierStats.total ?? 0,
          countries,
        });
        setResolved(true);
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

  return { ...stats, loading, resolved };
}
