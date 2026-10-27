/**
 * 采购公告类型 —— 以 crm_notice_public 原字段为准。
 * 读服务表的列表/详情不再起旧别名。
 */

export interface NoticeListItem {
  notice_pk: number;
  notice_id: string;
  source_url?: string | null;
  reference?: string | null;
  title: string;
  description?: string | null;
  description_cn?: string | null;
  content_level?: string | null;
  industry?: string | null;
  published_ts?: number | null;
  deadline_ts?: number | null;
  deadline_state?: string | null;
  deadline_type?: string | null;
  deadline_timezone?: string | null;
  timezone_source?: string | null;
  country_code?: string | null;
  country_codes?: string[] | null;
  notice_type_code?: string | null;
  platform_name?: string | null;
  buyer_name?: string | null;
  buyer_group?: string | null;
  estimated_value?: string | number | null;
  currency_code?: string | null;
  currency_source?: string | null;
  contacts?: NoticeContact[] | null;
  attachments?: NoticeAttachment[] | null;
  external_links?: NoticeAttachment[] | null;
  registration_level?: string | null;
  beneficiary_countries?: string | null;
  updated_at?: number | null;
  is_opportunity?: number | boolean | null;

  // 搜索/翻译/门控补充字段（宽表或接口计算，不是服务表列）
  agency_i18n?: string;
  title_i18n?: string;
  description_i18n?: string;
  title_en?: string;
  description_en?: string;
  bid_overview?: string;
  backbone_path?: string;
  create_time?: string;
  core_locked?: boolean;
  breakdown_file_count?: number;
  contact_count?: number;
  unlock_type?: string;
  unlocked_at?: string;
  match_score?: number;
  match_tier?: string;
  reco_reasons?: string[];
  description_truncated?: number | boolean;
  report_available?: boolean;
  report_url?: string;
}

/** 解锁详情级补充字段（资格/报告仍由商机表补） */
export interface NoticeDetailFields {
  platform?: { canonical: string; code: string | null; zh: string } | null;
  supplier_conditions?: string;
  eligibility?: string;
  technical_hurdles?: string;
  ai_products?: unknown;
  ai_analysis?: Record<string, unknown>;
  deadline_timezone?: string | null;
  description_other?: string;
  original_description?: string;
}

export interface NoticeDetailItem extends NoticeListItem, NoticeDetailFields {}
export type NoticeItem = NoticeDetailItem;

/** 公告联系人 */
export interface NoticeContact {
  name?: string;
  title?: string;
  role?: string;
  email?: string;
  phone?: string;
  organization?: string;
}

/** 公告文件 / 外部链接 */
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
  /** 分页元数据：按命名红线② 口径允许 snake（与 pageSize 同值，服务端两个都发） */
  page_size?: number;
  variant?: string;
  /**
   * 高级关键词因未授权而被退化为基础词。
   * 与 needsIndustrySelection 都是状态标志（非分页元数据），因此按红线② 用 camelCase。
   * ⚠ 全仓暂无读取方：服务端已发旗标，前端尚未把它接成提示 UI。
   */
  advancedDegraded?: boolean;
  /** 检索范围不足以给出有意义的结果，需先选行业 */
  needsIndustrySelection?: boolean;
  match_relaxed?: boolean;
}




