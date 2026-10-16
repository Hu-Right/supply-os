"use client";

/**
 * 采购列表页 — 自动筛选提示条 + 结果列表分支（骨架/增强/经典），自 ProcurementPage.tsx 拆出，JSX 与注释逐字不变。
 *
 * 放宽说明必须贴着结果列表（此前置于搜索面板上方，用户先看到「共 N 条」再看解释，易误读）。
 *
 * @module features/procurement/components/procurement-page/ResultsSections
 */
import { useLocale } from "@/core/i18n";
import { flags } from "@/core/flags";
import { NoticeList } from "../NoticeList";
import { EnhancedNoticeList } from "../EnhancedNoticeList";
import { NoticeListSkeleton } from "../NoticeListSkeleton";
import { MatchRelaxedHint } from "../MatchRelaxedHint";
import { NOTICE_PAGE_SIZE } from "../../constants";
import type { NoticeItem } from "../../types";
import type { SearchState } from "./types";

/** 偏好/推荐模式状态告知条（纯信息展示，无操作入口） */
export function PrefsBanner({ prefsMode, prefsBannerName, query }: {
  prefsMode: string;
  prefsBannerName: string;
  query: SearchState["query"];
}) {
  const { t } = useLocale();
  if (!(prefsMode === "prefs" || prefsMode === "recommended")) return null;
  return (
    /* “查看全部”按钮已全模式移除：推荐态由搜索栏“清除筛选”替代，
       行业匹配态由工具栏“取消行业匹配”按钮替代（同一 exitAutoMode 降级链），
       原文案与实际跳转行为不符，保留会误导用户 */
    <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700">
      <span>
        {prefsMode === "prefs"
          ? query.hasSearch
            ? `${t("procurement_prefsBanner", { name: prefsBannerName })} + ${query.activeQ ? `“${query.activeQ}”` : ""}${query.activeCountry ? ` ${query.activeCountry}` : ""}${query.activeAgency ? ` ${query.activeAgency}` : ""}${query.activeFeatured ? ` ${t("procurement_featuredOnly")}` : ""}`.replace(/^\s*\+\s*/, "").trim()
            : t("procurement_prefsBanner", { name: prefsBannerName })
          : t("procurement_recommendedBanner")}
      </span>
    </div>
  );
}

/** 结果列表：首次加载骨架屏（数量对齐 NOTICE_PAGE_SIZE），后续搜索由 LoadingOverlay 覆盖 */
export function ResultsList({
  result,
  page,
  setPage,
  openNotice,
  feedbackEnabled,
  observeCard,
  favoriteIds,
  onToggleFavorite,
}: {
  result: SearchState["result"];
  page: number;
  setPage: (p: number) => void;
  openNotice: (n: NoticeItem) => void;
  feedbackEnabled: boolean;
  observeCard: (el: HTMLElement | null, noticeId: number) => void;
  favoriteIds: Set<number>;
  onToggleFavorite: (id: number) => void;
}) {
  if (result.loading && result.items.length === 0) {
    return <NoticeListSkeleton count={NOTICE_PAGE_SIZE} />;
  }
  const listProps = {
    items: result.items,
    loading: result.loading,
    page,
    totalPages: result.totalPages,
    serverPageSize: result.serverPageSize,
    total: result.total,
    setPage,
    openNotice,
    feedbackEnabled,
    observeCard,
    favoriteIds,
    onToggleFavorite,
  };
  return flags.ADVANCED_SEARCH
    ? <EnhancedNoticeList {...listProps} />
    : <NoticeList {...listProps} />;
}

/** 匹配放宽提示：仅在 AND 零结果被放宽时渲染 */
export { MatchRelaxedHint };
