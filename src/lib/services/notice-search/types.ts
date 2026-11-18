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
  /** 主表总行数（bid_notices，含已过期/未准入；仅作数据量参考） */
  raw: number;
  /** 有效机会总量：读 notice_public（用户可检索/可打开的机会池，2026-11-18 起） */
  active: number;
  /** 有效机会中已挂骨架节点（notice_backbone_nodes）的数量，与 active 同一服务表口径 */
  bridged: number;
  /** 有效机会中精选数：读服务表 notice_public.is_opportunity（= is_featured 或关联合格/在架/过审商机，
   *  与首页热门商机 featured=1 的检索口径同源；迁移 045 补了 (is_opportunity, deadline_ts) 索引） */
  featured: number;
  /** active - bridged */
  bridgeGap: number;
  /** 未来 30 天内截止的有效机会数（notice_public.deadline_ts 范围，2026-11-18 起） */
  deadlineIn30d: number;
  /** 含可下载附件的有效机会数：服务表虚拟生成列 has_attachments=1（由 attachments JSON 自动计算） */
  withOriginalDocs: number;
  /** 覆盖国家/地区数（首页「数据源/API」）：notice_public.country_code 去重（主国家 ISO2 口径，读侧零归一化） */
  countryCount: number;
}
