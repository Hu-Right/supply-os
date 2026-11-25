/**
 * /procurement 首屏服务端数据
 *
 * @description 供 ISR 页面直出默认查询的第一页公告，让 AI/爬虫在不执行 JS 时
 *              也能在 HTML 里读到公告标题、国家、截止时间等事实。
 *              构建阶段无数据库，直接返回 undefined（页面仍可构建）。
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { searchUnified } from "@/lib/services/search-orchestrator";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";

export async function loadProcurementInitial(): Promise<SearchResultsInitial | undefined> {
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  try {
    const result = await searchUnified(getPool(), {
      mode: "default",
      page: 1,
      pageSize: 10,
      sort: "latest",
      locale: "zh",
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
