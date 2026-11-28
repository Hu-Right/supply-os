/**
 * /procurement 首屏服务端数据
 *
 * @description 供 ISR 页面直出默认查询的第一页公告，让 AI/爬虫在不执行 JS 时
 *              也能在 HTML 里读到公告标题、国家、截止时间等事实。
 *              构建阶段无数据库，直接返回 undefined（页面仍可构建）。
 *
 *              2026-11-28：首屏此前只认 `country`，带 `q`/截止/类型/预算/品目/排序
 *              的 URL 直出的仍是「全球最新 10 条」，客户端水合前会先闪一屏未筛选结果
 *              （首页热词 `?q=xxx` 是最常见入口）。现在按 URL 参数原样透传给
 *              `searchUnified`，与客户端 `fetchUnifiedSearch` 同一套参数口径。
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { searchUnified } from "@/lib/services/search-orchestrator";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";

/** URL 筛选项（与客户端 fetchUnifiedSearch 入参同名，SSR/CSR 共用一套语义） */
export interface ProcurementInitialFilters {
  q?: string;
  country?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featured?: boolean;
  budgetMin?: number;
  budgetMax?: number;
  commodityPath?: string;
  sort?: string;
  matchMode?: string;
}

export async function loadProcurementInitial(
  filters: ProcurementInitialFilters = {},
): Promise<SearchResultsInitial | undefined> {
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  try {
    const result = await searchUnified(getPool(), {
      mode: "default",
      page: 1,
      pageSize: 10,
      sort: filters.sort ?? "latest",
      locale: "zh",
      ...filters,
    });
    const items = toNoticeListView(result.items);
    // 匿名首屏：不携带译文权益，保持与 /api/notices/unified-search 同口径
    maskTranslationFieldList(items);
    return { items, total: result.total, pageSize: result.pageSize };
  } catch (err) {
    console.error("[procurement] 首屏直出取数失败:", (err as Error).message);
    return undefined;
  }
}
