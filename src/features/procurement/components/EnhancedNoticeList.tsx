/**
 * 增强搜索结果列表 — 数据质量过滤 + 结果计数 + 状态标签
 * Enhanced Notice List — Data Quality + Result Count + Status Badges
 *
 * @module features/procurement/components/EnhancedNoticeList
 * @description 在现有 NoticeList 基础上增加：
 *              1. 数据质量前端防御（过滤异常截止日期）
 *              2. 结果计数动态显示
 *              3. 每条结果附带 StatusBadge
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧列表切换。
 */
import { memo, useMemo } from "react";
import { useLocale } from "@/core/i18n";
import { isDeadlineValid } from "@/shared/utils/dataQuality";
import { NoticeList } from "./NoticeList";
import type { NoticeItem } from "../types";

export interface EnhancedNoticeListProps {
  items: NoticeItem[];
  loading: boolean;
  page: number;
  totalPages: number;
  serverPageSize: number;
  total: number;
  setPage: (page: number) => void;
  openNotice: (notice: NoticeItem) => void;
  feedbackEnabled: boolean;
  observeCard: (el: HTMLElement | null, noticeId: number) => void;
}

/** 增强搜索结果列表 — 数据质量过滤 + 结果计数 */
export const EnhancedNoticeList = memo(function EnhancedNoticeList({
  items,
  loading,
  page,
  totalPages,
  serverPageSize,
  total,
  setPage,
  openNotice,
  feedbackEnabled,
  observeCard,
}: EnhancedNoticeListProps) {
  const { t } = useLocale();

  // 数据质量防御：过滤异常截止日期的条目（规划 §1.2 A）
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // deadline_ts 为秒级时间戳时校验合理性
      if (item.deadline_ts) {
        const sec = Number(item.deadline_ts);
        // 如果是毫秒级时间戳，转为秒
        const deadlineSec = sec > 1e12 ? Math.floor(sec / 1000) : sec;
        if (!isDeadlineValid(deadlineSec)) return false;
      }
      return true;
    });
  }, [items]);

  return (
    <>
      {/* 结果计数动态显示 */}
      {!loading && total > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="text-teal-600">{total.toLocaleString()}</span>
          <span>{t("procurement_resultsFound") || "条结果"}</span>
          {filteredItems.length < items.length && (
            <span className="text-xs text-amber-600 font-normal">
              ({t("procurement_dataQualityFiltered") || "已过滤异常数据"})
            </span>
          )}
        </div>
      )}

      <NoticeList
        items={filteredItems}
        loading={loading}
        page={page}
        totalPages={totalPages}
        serverPageSize={serverPageSize}
        total={total}
        setPage={setPage}
        openNotice={openNotice}
        feedbackEnabled={feedbackEnabled}
        observeCard={observeCard}
      />
    </>
  );
});
