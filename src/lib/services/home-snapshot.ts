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
import { searchUnified } from "./search-orchestrator";
import { toNoticeListView } from "./notice-public/view";
import { listSupplierDirectoryPage } from "./suppliers";
import type { Supplier } from "../types/supplier";
import type { NoticeDetailItem } from "../../types/procurement";

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

// ── 首页三栏内容快照 ──

/** 三栏内容快照（列表项形状与对应端点响应的 items 一致，可序列化进 client props） */
export interface HomeContentSnapshot {
  /** 热门商机（is_featured=1，最新 20 条）——/api/notices/unified-search?featured=1 同口径 */
  hotNotices: NoticeDetailItem[];
  /** 最新 RFQ 询价公告（notice_type=RFQ，最新 20 条）——unified-search?notice_type=RFQ 同口径 */
  rfqNotices: NoticeDetailItem[];
  /** 优质供应商（最新 20 条）——/api/suppliers?pageSize=20&sort=latest 同口径 */
  suppliers: Supplier[];
}

/**
 * 组装首页三栏内容快照（ISR 渲染期直出，客户端 ContentColumns 挂载后后台刷新保新鲜）。
 * 三个列表彼此独立：任一路失败该列落空数组并留 warn，不拖垮其余两列
 * （数字墙快照的「整体抛出」语义在这里不适用——内容列缺一列不该全站降级）。
 */
export async function getHomeContentSnapshot(pool: Pool): Promise<HomeContentSnapshot> {
  // 与客户端取数同一天文窗：北京时间自然日（deadline_from=今天，只推未过期商机）
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  const [hot, rfq, suppliers] = await Promise.allSettled([
    searchUnified(pool, { page: 1, pageSize: 20, featuredOnly: true, sort: "newest", deadlineFrom: today }),
    searchUnified(pool, { page: 1, pageSize: 20, noticeType: "RFQ", sort: "newest", deadlineFrom: today }),
    listSupplierDirectoryPage({ page: 1, pageSize: 20, sort: "latest" }),
  ]);

  const settled = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[home-snapshot] 三栏内容 ${label} 失败，该列降级为空:`, (r.reason as Error)?.message);
    return fallback;
  };

  const hotResult = settled(hot, "hotNotices", null);
  const rfqResult = settled(rfq, "rfqNotices", null);
  const supplierResult = settled(suppliers, "suppliers", null);

  return {
    // 行→视图：与 unified-search 路由出口同一条 toNoticeListView（红线②，列名不得直出）
    hotNotices: hotResult ? toNoticeListView(hotResult.items) : [],
    rfqNotices: rfqResult ? toNoticeListView(rfqResult.items) : [],
    suppliers: supplierResult ? supplierResult.items : [],
  };
}
