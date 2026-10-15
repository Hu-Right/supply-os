/**
 * 采购公告类型
 * Procurement Notice Types
 *
 * @module types/procurement
 * @description 采购公告实体（含旧品类码、锁定状态、解锁详情字段）及分页响应结构。
 *              作为全局单一事实源，feature 层通过 `@/types` re-export 复用。
 *              #ARCH-004: 拆分为 NoticeListItem（列表级）+ NoticeDetailItem（解锁详情）
 *              两个窄接口。NoticeItem 不是兼容别名，而是「列表项 + 可选详情字段」的交叉类型
 *              （= NoticeListItem & Partial<NoticeDetailFields>），NoticeResponse.items 自身就在用它，
 *              因此不可简单地用 NoticeListItem 替掉——那会丢掉 Partial<NoticeDetailFields> 这部分能力。
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
  /** 主表入库时间（宽表无此列，detail-fetch 二次查询合并），NEW 标签判定用 */
  create_time?: string;
  estimated_value?: string;
  description?: string;
  source_url?: string;
  core_locked?: boolean;
  /** 锁定态拆解文件计数预览 */
  breakdown_file_count?: number;
  /** 锁定态联系人数量预告 */
  contact_count?: number;
  unlock_type?: string;
  unlocked_at?: string;
  /** 推荐模式命中的旧品类码兴趣码数 */
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

/**
 * 国际公共采购结构化字段（迁移 088 的 17 列）已于 2026-10-12 退役：
 * 原先在此导出的 `IntlProcurementKey` / `NoticeIntlProcurement` 与详情级的
 * `intl_procurement` 字段一并摘除。判据与待删列名唯一事实源见
 * `scripts/tools/opp-slim-plan.mjs`（RETIRED_INTL_COLUMNS）与
 * docs/数据库设计/crm_bid_opportunities-投标商机表.md；守卫单测随之反向化为
 * 「机会行不得再带出这批键」。
 */

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
  /** 供应商投标条件 */
  supplier_conditions?: string;
  /** 资格要求 */
  eligibility?: string;
  /** 技术门槛 */
  technical_hurdles?: string;
  /** AI 识别产品清单 */
  ai_products?: unknown;
  /** AI 深度分析 */
  ai_analysis?: Record<string, unknown>;
  /** 截止时间（国际标含时刻，如 "2026-10-28 09:30:00"）：已由 NoticeListItem 声明，此处不重复 */
  /** 截止时刻的 IANA 时区（如 Africa/Casablanca）；无它则非整日截止无法正确倒计时 */
  deadline_timezone?: string;
  /** 非中文非英文原文摘要（如法语），用于「查看原文」与译文校对 */
  description_other?: string;
  /** 完整原文（供"查看原文"切换使用；主表 description 仅存标题） */
  original_description?: string;
  /** 描述是否被 SQL 截断（300 字符），用于前端显示 ... 提示 */
  description_truncated?: number | boolean;
}

/** 解锁后的完整公告（列表字段 + 详情字段） */
export interface NoticeDetailItem extends NoticeListItem, NoticeDetailFields {}

/**
 * 公告通用类型（= 列表项 + 可选详情字段的交叉类型）。
 * 非兼容别名：列表接口与解锁详情接口都以它为返回口径（NoticeResponse.items、
 * fetchNoticeDetail 等）；仅需列表字段时可收窄为 NoticeListItem，需完整详情时用 NoticeDetailItem。
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
  /** 高级语法被降级剥离（未订阅 advanced_keyword_search）——仅 unified-search 降级时返回 */
  advanced_degraded?: boolean;
  /** 硬 AND 零结果时已自动放宽为 OR（任一命中）——仅放宽时返回；前端必须显式告知用户 AND 命中为 0 */
  match_relaxed?: boolean;
}
