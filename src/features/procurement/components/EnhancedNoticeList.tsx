/**
 * 增强搜索结果列表 — 数据质量过滤
 * Enhanced Notice List — Data Quality Filtering
 *
 * @module features/procurement/components/EnhancedNoticeList
 * @description 在现有 NoticeList 基础上增加：
 *              1. 数据质量前端防御（过滤异常截止日期）
 *              结果计数和排序控制已上移到 ProcurementPage 结果头部。
 *              通过 FEATURE_ADVANCED_SEARCH flag 控制新旧列表切换。
 */
import { memo, useMemo } from "react";
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

/** 增强搜索结果列表 — 数据质量过滤 */
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
  );
});
