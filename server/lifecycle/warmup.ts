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
import { refreshNoticeStats, refreshNoticeCountries, refreshNoticeAgencies } from "../services/notice-search/index";
import { searchUnified, type RawSearchParams } from "../services/search-orchestrator/index";
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
  // 重构后：统一编排器 searchUnified（mode=default）接管全部搜索预热
  const warm = (extra: Partial<RawSearchParams>) =>
    searchUnified(dbPool, { mode: "default", page: 1, pageSize: 9, locale: "zh", ...extra }, noticesRepo);
  await Promise.all([
    // 统计表刷新
    refreshNoticeStats(dbPool),
    // 首页（中文 + 英文）
    warm({ locale: "zh" }),
    warm({ locale: "en" }),
    // 翻页预热
    warm({ page: 2 }),
    // 关键词全文检索预热（中英文）
    warm({ q: "construction" }),
    warm({ locale: "en", q: "construction" }),
    warm({ q: "招标" }),
    // 纯筛选预热
    warm({ country: "Canada" }),
    warm({ country: "Brazil" }),
    warm({ country: "Germany" }),
    // 高频组合搜索预热
    warm({ q: "construction", country: "Canada" }),
    warm({ q: "construction", agency: "United Nations" }),
    warm({ q: "construction", agency: "United Nations", country: "France" }),
    // PERF 优化：关键词+采购类型组合预热
    warm({ noticeType: "RFQ" }),
    warm({ noticeType: "ITB" }),
    warm({ noticeType: "RFP" }),
    warm({ noticeType: "EOI" }),
    warm({ noticeType: "RFQ", country: "Brazil" }),
    warm({ q: "construction", noticeType: "ITB" }),
    warm({ q: "supply", noticeType: "RFQ" }),
    // PERF 优化：关键词+截止日期组合预热
    warm({ q: "road", deadlineWithinDays: 90 }),
    warm({ q: "bridge", deadlineWithinDays: 90, noticeType: "ITB" }),
    // 国家/机构下拉 + 供应商目录
    refreshNoticeCountries(dbPool),
    refreshNoticeAgencies(dbPool),
    suppliersRepo.listDirectory(),
  ]);

  return Math.round(performance.now() - warmupStart);
}
