/**
 * 首页快照（服务端直出数据）
 * Home Snapshot — server-side first-screen data for ISR prerender
 *
 * @module lib/services/home-snapshot
 * @description 首页数字墙 4 个数 + 世界地图国家计数的单一取数口：
 *              与 /api/notices/stats、/api/notices/countries、/api/suppliers
 *              走完全相同的 service/repo 口径（不得在此另写一份 SQL 算法），
 *              供 app/(public)/page.tsx 在 ISR 渲染期注入 initialHome，
 *              让静态 HTML 直接带真实数字（客户端 useHomeStats 随后照常
 *              后台刷新，接管 10 分钟轮询）。
 *              任何一路失败整体抛出，由页面调用方降级为「不带初值」。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { getContext } from "@/lib/db/context";
import { getNoticeStats, getNoticeDailyNew, getNoticeCountries } from "./notice-search";

/** 首页快照（形状与 features/home 的 HomeStatsData 一致，可序列化进 client props） */
export interface HomeSnapshot {
  noticeActive: number;
  noticeTodayNew: number;
  countryCount: number;
  certifiedSupplierCount: number;
  countries: Array<{ country: string; count: number }>;
}

/**
 * 组装首页快照。
 * - noticeActive：六路 COUNT 的 active（10 分钟服务端缓存）
 * - noticeTodayNew：北京时间自然日切窗（stats.ts 唯一口径）
 * - countries/countryCount：与 /api/notices/countries 同 service
 * - certifiedSupplierCount：与 /api/suppliers 分页分支同一 total 口径
 *   （历史注意：该端点不识别 status 查询参数，初值必须镜像其真实行为，
 *   否则 hydration 前后数字会跳变）
 */
export async function getHomeSnapshot(pool: Pool): Promise<HomeSnapshot> {
  const [stats, countries, daily] = await Promise.all([
    getNoticeStats(pool),
    getNoticeCountries(pool),
    getNoticeDailyNew(pool),
  ]);
  const { total: supplierTotal } = await getContext().supplier.directoryRepo.listDirectoryPaginated({
    limit: 1,
    offset: 0,
  });
  return {
    noticeActive: stats.active,
    noticeTodayNew: daily.todayNew,
    countryCount: countries.length,
    certifiedSupplierCount: supplierTotal,
    countries,
  };
}
