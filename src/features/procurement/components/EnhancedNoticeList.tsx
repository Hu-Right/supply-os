/**
 * 增强搜索结果列表
 * Enhanced Notice List
 *
 * @module features/procurement/components/EnhancedNoticeList
 * @description 通过 FEATURE_ADVANCED_SEARCH flag 控制新旧列表切换。
 *              结果计数和排序控制已上移到 ProcurementPage 结果头部。
 *
 *              数据质量防御说明：已移除旧版 isDeadlineValid 前端过滤。
 *              原因：后端 MEILI_ACTIVE_FILTER 已确保只返回未过期记录
 *             （deadline_sec = 0 OR deadline_sec >= now），不存在已过期
 *              数据泄漏风险。而 isDeadlineValid 的「当前年份+2」上限会
 *              在"截至最远优先"排序时将合法的远期截止公告全部过滤，
 *              导致首页为空。远期截止日（如 2030+）是国际公采的正常现象。
 */
import { memo } from "react";
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

/** 增强搜索结果列表 */
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
  return (
    <NoticeList
      items={items}
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
