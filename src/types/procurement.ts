/**
 * 采购公告类型 —— 对外契约（camelCase）
 *
 * 字段名不再镜像 notice_public 列名：列名属存储层，契约由本文件定义，
 * 行→视图的改名集中在 lib/services/notice-public/view.ts 一处（命名红线②）。
 * 因此本文件里的名字就是响应 JSON 的键名，与 SQL 里的列名可以不同名。
 */

export interface NoticeListItem {
  noticePk: number;
  noticeId: string;
  sourceUrl?: string | null;
  reference?: string | null;
  title: string;
  description?: string | null;
  descriptionCn?: string | null;
  contentLevel?: string | null;
  industry?: string | null;
  publishedTs?: number | null;
  deadlineTs?: number | null;
  deadlineState?: string | null;
  deadlineType?: string | null;
  deadlineTimezone?: string | null;
  timezoneSource?: string | null;
  countryCode?: string | null;
  countryCodes?: string[] | null;
  noticeTypeCode?: string | null;
  platformName?: string | null;
  buyerName?: string | null;
  buyerGroup?: string | null;
  estimatedValue?: string | number | null;
  currencyCode?: string | null;
  currencySource?: string | null;
  contacts?: NoticeContact[] | null;
  attachments?: NoticeAttachment[] | null;
  externalLinks?: NoticeAttachment[] | null;
  difficulty?: string | null;
  registrationLevel?: string | null;
  beneficiaryCountries?: string | null;
  updatedAt?: number | null;
  isOpportunity?: number | boolean | null;

  // 搜索/翻译/门控补充字段（接口计算或由关联表补，不是服务表列）
  agencyI18n?: string;
  titleI18n?: string;
  descriptionI18n?: string;
  titleEn?: string;
  descriptionEn?: string;
  backbonePath?: string;
  entrySource?: string;
  coreLocked?: boolean;
  breakdownFileCount?: number;
  contactCount?: number;
  unlockType?: string;
  unlockedAt?: string;
  matchScore?: number;
  matchTier?: string;
  recoReasons?: string[];
  descriptionTruncated?: number | boolean;
  reportAvailable?: boolean;
  reportUrl?: string;
}

/** 解锁详情级补充字段（资格/报告仍由商机表补） */
export interface NoticeDetailFields {
  platform?: { canonical: string; code: string | null; zh: string } | null;
  supplierConditions?: string;
  eligibility?: string;
  technicalHurdles?: string;
  aiProducts?: unknown;
  aiAnalysis?: Record<string, unknown>;
  deadlineTimezone?: string | null;
  descriptionOther?: string;
  originalDescription?: string;
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
  page?: number;
  /** 分页元数据：按命名红线② 口径允许 snake（与请求参数 page_size 同名同义）。
   *  2026-10-28：路由信封改为显式列举后，spread 漏出来的同值 `pageSize` 已撤——
   *  同一名值不双发，不做 camel↔snake 桥。 */
  page_size?: number;
  /** 推荐模式 A/B 桶标记 */
  variant?: string;
  /** 检索降级路径（服务侧诊断键，全 src 无读取方，留着供排障看响应） */
  fallback?: "no_prefs" | "no_match" | "mysql_degraded" | "none";
  /**
   * 高级关键词因未授权而被退化为基础词。
   * 与 needsIndustrySelection 都是状态标志（非分页元数据），因此按红线② 用 camelCase。
   * ⚠ 全仓暂无读取方：服务端已发旗标，前端尚未把它接成提示 UI。
   */
  advancedDegraded?: boolean;
  /** 检索范围不足以给出有意义的结果，需先选行业 */
  needsIndustrySelection?: boolean;
  matchRelaxed?: boolean;
}




