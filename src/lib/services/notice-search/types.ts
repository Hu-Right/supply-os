/**
 * 公采搜索类型定义
 * Notice search type definitions
 *
 * @module server/services/notice-search/types
 */

export interface NoticeSearchParams {
  page: number;
  pageSize: number;
  codeId?: number;
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
  /** 当前用户 locale（用于 LEFT JOIN 翻译表返回 title_i18n/description_i18n） */
  locale?: string;
}

export interface NoticeSearchResult {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NoticeStatsResult {
  raw: number;
  active: number;
  bridged: number;
  featured: number;
  bridgeGap: number;
  /** 未来 30 天内截止的有效公告数（模块02 规模条口径） */
  deadlineIn30d: number;
  /** 含原始文件（宽表 documents_count>0）的有效公告数 */
  withOriginalDocs: number;
}
