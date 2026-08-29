/**
 * 采购公告类型
 * Procurement Notice Types
 *
 * @module types/procurement
 * @description 采购公告实体（含 UNSPSC 编码、锁定状态、解锁详情字段）及分页响应结构。
 *              作为全局单一事实源，feature 层通过 `@/types` re-export 复用。
 *              #ARCH-004: 拆分为 NoticeListItem（列表级）+ NoticeDetailItem（解锁详情）
 *              两个窄接口，NoticeItem 保留为列表级别名以兼容存量代码。
 */

/** 公告列表级字段（搜索/推荐/行业匹配等列表端点返回） */
export interface NoticeListItem {
  id: number;
  notice_id?: string;
  reference?: string;
  title: string;
  notice_type?: string;
  agency?: string;
  /** 当前 locale 的机构翻译名 */
  agency_i18n?: string;
  organization?: string;
  country?: string;
  deadline?: string;
  /** Unix 时间戳（秒或毫秒），供前端时区转换使用 */
  deadline_ts?: number | string;
  estimated_value?: string;
  description?: string;
  source_url?: string;
  unspsc_codes?: Array<{ code?: string; name?: string; description?: string }>;
  core_locked?: boolean;
  /** 锁定态拆解文件计数预览 */
  breakdown_file_count?: number;
  /** 锁定态联系人数量预告 */
  contact_count?: number;
  unlock_type?: string;
  unlocked_at?: string;
  /** 推荐模式命中的 UNSPSC 兴趣码数 */
  match_score?: number;
  /** 行业精准匹配命中档次 */
  match_tier?: string;
  /** 推荐理由标签键 */
  reco_reasons?: string[];
  /** 精选公告标注 */
  is_featured?: boolean;
  /** 列表级国际化标题 */
  title_i18n?: string;
  /** 列表级国际化描述 */
  description_i18n?: string;
  /** 中文翻译回退 */
  title_zh?: string;
  /** 英文翻译回退 */
  title_en?: string;
  /** 英文翻译回退描述 */
  description_en?: string;
  /** 精选公告人工/AI 精加工的中文描述 */
  description_cn?: string;
  /** 招标内容 / 投标内容概览（列表级截断 200 字符） */
  bid_overview?: string;
  /** 受援助国（逗号分隔字符串） */
  beneficiary_countries?: string;
}

/** 解锁详情级字段（由 /api/notices/:id/detail 补充） */
export interface NoticeDetailFields {
  url?: string;
  agency_full?: string;
  published_date?: string;
  difficulty?: string;
  registration_level?: string;
  contacts?: NoticeContact[];
  key_contacts?: NoticeContact[] | string;
  documents?: NoticeAttachment[];
  procurement_files?: NoticeAttachment[];
  external_links?: NoticeAttachment[];
  /** 中文版订单拆解报告可用 */
  report_available?: boolean;
  /** 报告下载路径 */
  report_url?: string;
}

/** 解锁后的完整公告（列表字段 + 详情字段） */
export interface NoticeDetailItem extends NoticeListItem, NoticeDetailFields {}

/**
 * 公告通用类型（向后兼容，包含列表 + 详情全部字段）。
 * 新代码建议使用 NoticeListItem（仅列表字段）或 NoticeDetailItem（列表 + 详情字段）。
 */
export type NoticeItem = NoticeListItem & Partial<NoticeDetailFields>;

/** 公告联系人（解锁详情） */
export interface NoticeContact {
  name?: string;
  title?: string;
  role?: string;
  email?: string;
  phone?: string;
  organization?: string;
}

/** 公告文件 / 外部链接（解锁详情） */
export interface NoticeAttachment {
  name?: string;
  title?: string;
  label?: string;
  url?: string;
  link?: string;
  type?: string;
}

export interface NoticeResponse {
  items?: NoticeItem[];
  total?: number;
  pageSize?: number;
  page_size?: number;
  /** T-B10（本地差异 #15）：A/B 分桶标记（仅推荐端点返回），反馈埋点原样回传 */
  variant?: string;
}
