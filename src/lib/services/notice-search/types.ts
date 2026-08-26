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
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AgencyCacheItem {
  agency: string;
  count: number;
  i18n: Record<string, string> | null;
  /** 该 canonical 对应的数据库原始机构名列表（用于筛选时 IN 匹配） */
  originalAgencies?: string[];
  /** PERF 优化：聚合组标识（如 "MUNICIPIO_BR"），用于 Meilisearch 筛选时替代数百个 OR 条件 */
  agencyGroup?: string;
  /** PERF 优化：SQL LIKE 模式（如 "MUNICIPIO %"），用于 MySQL 路径高效匹配大型聚合组 */
  sqlPattern?: string;
}

export interface NoticeStatsResult {
  raw: number;
  active: number;
  bridged: number;
  featured: number;
  bridge_gap: number;
}
