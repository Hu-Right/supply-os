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
import { getHomeNoticeStats, getNoticeDailyNew, getNoticeCountries } from "./notice-search";
import { listSupplierDirectoryPage } from "./suppliers-directory";
import { getHotTopics } from "./notice-search";
import { getHotSearches, hotSearchHref } from "./search-analytics";
import { getHomeNoticeColumn } from "./notice-public/home-columns";
import { toNoticeListView } from "./notice-public/view";
import { maskTranslationFieldList } from "./notice-public/translation-access";
import type { Supplier } from "../types/supplier";
import type { NoticeDetailItem } from "../../types/procurement";
import type { HotTopics } from "./notice-search/hot-topics";

/** 首页快照（形状与 features/home 的 HomeStatsData 一致，可序列化进 client props） */
export interface HomeSnapshot {
  noticeActive: number;
  noticeTodayNew: number;
  countryCount: number;
  certifiedSupplierCount: number;
  /** 库内供应商总数（全部审核状态，数字墙第四张卡） */
  supplierTotal: number;
  countries: Array<{ country: string; count: number }>;
}

/**
 * 组装首页快照。
 * - noticeActive：六路 COUNT 的 active（10 分钟服务端缓存；读服务表 notice_public）
 * - noticeTodayNew：北京时间自然日切窗（stats.ts 唯一口径，读主表 create_time）
 * - countryCount：覆盖国家/地区数（2026-11-18 起读服务表 COUNT(DISTINCT country_code)，
 *   主国家 ISO2 口径、读侧零归一化；countries 列表仍供世界地图用，两者口径不同属有意）
 * - certifiedSupplierCount：已审通过的目录口径（countApproved，AboutSection「认证供应商」）
 * - supplierTotal：supplier 全表口径（countAll，数字墙「供应商总数」）
 *   两者与 /api/suppliers/stats 的 searchable / total 同源，避免首帧与刷新后跳变
 */
/** 首页快照进程缓存：ISR 每 60s 触发一次，但数字墙不应每次都等 5s 的 COUNT。 */
let homeSnapshotCache: { data: HomeSnapshot; expires: number } | null = null;

export async function getHomeSnapshot(pool: Pool): Promise<HomeSnapshot> {
  if (homeSnapshotCache && homeSnapshotCache.expires > Date.now()) {
    return homeSnapshotCache.data;
  }
  // 国家列表只服务世界地图；不参与数字墙，单独兜底，慢查询不能拖垮整块快照。
  const countriesPromise = getNoticeCountries(pool).catch(() => [] as Array<{ country: string; count: number }>);
  const [stats, daily] = await Promise.all([
    getHomeNoticeStats(pool),
    getNoticeDailyNew(pool),
  ]);
  const repo = getContext().supplier.directoryRepo;
  const [supplierTotal, certifiedSupplierCount] = await Promise.all([
    repo.countAll(),
    repo.countApproved(),
  ]);
  const countries = await Promise.race([
    countriesPromise,
    new Promise<Array<{ country: string; count: number }>>((resolve) =>
      setTimeout(() => resolve([]), 2_000),
    ),
  ]);
  const snapshot: HomeSnapshot = {
    noticeActive: stats.active,
    noticeTodayNew: daily.todayNew,
    countryCount: stats.countryCount,
    certifiedSupplierCount,
    supplierTotal,
    countries,
  };
  homeSnapshotCache = { data: snapshot, expires: Date.now() + 5 * 60_000 };
  return snapshot;
}

// ── 首页三栏内容快照 ──

/** 真实热门搜索快照（与 /api/notices/hot-searches 同 shape；fallback 时 keywords 为空） */
export interface HotSearchesSnapshot {
  mode: "hot" | "fallback";
  keywords: Array<{ term: string; label: string; href: string }>;
}

/** 三栏内容快照（列表项形状与对应端点响应的 items 一致，可序列化进 client props） */
export interface HomeContentSnapshot {
  /** 热门品目大类（服务端 10 分钟缓存同源；null=该路失败回退客户端取数） */
  hotTopics: HotTopics | null;
  /** 真实热门搜索（数据不足/失败为 null → Hero 回退到数据覆盖榜） */
  hotSearches: HotSearchesSnapshot | null;
  /** 热门商机（服务表 is_opportunity=1，最新入库 20 条）——/api/notices/home-columns?type=opportunity 同口径 */
  hotNotices: NoticeDetailItem[];
  /** 最新 RFQ 询价公告（服务表 notice_type_code=RFQ，最新入库 20 条）——/api/notices/home-columns?type=rfq 同口径 */
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
  const [hot, rfq, suppliers, hotTopicsR, hotSearchesR] = await Promise.allSettled([
    // 2026-11-18 起：热门商机 / 最新 RFQ 直接读服务表（不再经 unified-search/Meili；
    // 首页曝光也不再写 user_search_log 污染热门搜索统计）
    getHomeNoticeColumn(pool, "opportunity", 20),
    getHomeNoticeColumn(pool, "rfq", 20),
    listSupplierDirectoryPage({ page: 1, pageSize: 20, sort: "latest" }),
    getHotTopics(pool),
    getHotSearches(pool, { limit: 8 }),
  ]);

  const settled = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[home-snapshot] 三栏内容 ${label} 失败，该列降级为空:`, (r.reason as Error)?.message);
    return fallback;
  };

  const hotResult = settled(hot, "hotNotices", null);
  const rfqResult = settled(rfq, "rfqNotices", null);
  const supplierResult = settled(suppliers, "suppliers", null);
  const hotTopicsResult = settled(hotTopicsR, "hotTopics", null);
  const hotSearchesResult = settled(hotSearchesR, "hotSearches", null);

  return {
    // 服务表列在出口统一走 toNoticeListView（红线②，列名不得直出）。
    // 首页快照是公开面（RSC 直出 + ISR 缓存，无法按账号个性化）：译文一律裁掉只给原文
    // （2026-11-24 口径 A+3 的公开面例外，与 /api/notices/home-columns 同口径）。
    hotNotices: hotResult ? maskTranslationFieldList(toNoticeListView(hotResult)) : [],
    rfqNotices: rfqResult ? maskTranslationFieldList(toNoticeListView(rfqResult)) : [],
    suppliers: supplierResult ? supplierResult.items : [],
    hotTopics: hotTopicsResult,
    hotSearches: hotSearchesResult
      ? {
          mode: hotSearchesResult.mode,
          keywords: hotSearchesResult.terms.map((t) => ({
            term: t.term,
            label: t.label,
            href: hotSearchHref(t.term),
          })),
        }
      : null,
  };
}
