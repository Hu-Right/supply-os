/**
 * 启动预热服务
 * Startup warmup service
 *
 * @module server/lifecycle/warmup
 * @description 启动时后台异步预热 MySQL Buffer Pool + 搜索缓存 + 国家/机构下拉数据。
 *              消除首次用户请求的 ~3000ms 冷启动延迟。
 */
import type { Pool } from "mysql2/promise";
import type { NoticesRepo } from "../repos/notices.repo";
import type { SuppliersRepo } from "../repos/suppliers.repo";
import { searchNotices, refreshNoticeStats, refreshNoticeCountries, refreshNoticeAgencies } from "../services/notice-search/index";
import { syncNoticeIds, isHealthy as isMeiliHealthy } from "../services/meilisearch/index";

export interface WarmupDeps {
  dbPool: Pool;
  noticesRepo: NoticesRepo;
  suppliersRepo: SuppliersRepo;
}

/**
 * 执行启动预热（后台异步，不阻塞服务启动）
 * @returns 预热耗时（ms），失败时返回 -1
 */
export async function runWarmup(deps: WarmupDeps): Promise<number> {
  const { dbPool, noticesRepo, suppliersRepo } = deps;
  const warmupStart = performance.now();

  // Phase 1：统计表 + 搜索 + 国家/机构 + 供应商 并行预热
  await Promise.all([
    // 统计表刷新
    refreshNoticeStats(dbPool),
    // 首页（中文 + 英文）
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "en" }, noticesRepo),
    // 翻页预热
    searchNotices(dbPool, { page: 2, pageSize: 9, locale: "zh" }, noticesRepo),
    // 关键词 FULLTEXT 预热（中英文）
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "en", q: "construction" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "招标" }, noticesRepo),
    // 纯筛选预热
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", country: "Canada" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", country: "Brazil" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", country: "Germany" }, noticesRepo),
    // 高频组合搜索预热
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction", country: "Canada" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction", agency: "United Nations" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction", agency: "United Nations", country: "France" }, noticesRepo),
    // PERF 优化：关键词+采购类型组合预热（COUNT 冷启动可达 4s+，预热后缓存 30min）
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", noticeType: "RFQ" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", noticeType: "ITB" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", noticeType: "RFP" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", noticeType: "EOI" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", noticeType: "RFQ", country: "Brazil" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction", noticeType: "ITB" }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "supply", noticeType: "RFQ" }, noticesRepo),
    // PERF 优化：关键词+截止日期组合预热（COUNT 冷启动可达 300ms+）
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "road", deadlineWithinDays: 90 }, noticesRepo),
    searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "bridge", deadlineWithinDays: 90, noticeType: "ITB" }, noticesRepo),
    // 国家/机构下拉 + 供应商目录
    refreshNoticeCountries(dbPool),
    refreshNoticeAgencies(dbPool),
    suppliersRepo.listDirectory(),
  ]);

  return Math.round(performance.now() - warmupStart);
}
