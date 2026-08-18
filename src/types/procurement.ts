/**
 * 采购公告类型
 * Procurement Notice Types
 *
 * @module types/procurement
 * @description 采购公告实体（含 UNSPSC 编码、锁定状态、解锁详情字段）及分页响应结构。
 *              作为全局单一事实源，feature 层通过 `@/types` re-export 复用。
 *              Procurement notice entity (with UNSPSC codes, lock status, unlocked
 *              detail fields) and paginated response. Single source of truth; the
 *              feature layer re-exports it via `@/types`.
 */

export interface NoticeItem {
  id: number;
  notice_id?: string;
  reference?: string;
  title: string;
  notice_type?: string;
  agency?: string;
  /** 当前 locale 的机构翻译名（服务端按 locale 从聚合缓存下发） */
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
  /** 锁定态拆解文件计数预览（仅数量不含清单，服务端本地差异 #19；缺失时前端回退中性提示） */
  breakdown_file_count?: number;
  /** 锁定态联系人数量预告（仅数量不含身份，预览端点下发；0 表示无可预告联系人） */
  contact_count?: number;
  unlock_type?: string;
  unlocked_at?: string;
  /** 推荐模式命中的 UNSPSC 兴趣码数（仅 /api/notices/recommended 返回） */
  match_score?: number;
  /** 行业精准匹配命中档次（仅行业匹配频道返回：precise=精确匹配/relevant=行业相关） */
  match_tier?: string;
  /** 推荐理由标签键（C.3.4，每卡至多 2 个；前端映射 procurement_reason_* i18n 键渲染） */
  reco_reasons?: string[];
  /** 精选公告（T-A4，本地差异 #14）：对应合格机会三路判定，列表端点批量标注 */
  // [精选功能重新启用 2026-07-31] 字段恢复（服务端标注与前端徽标已同步恢复）
  is_featured?: boolean;
  /** 列表级国际化标题（来自 crm_notice_translations；缺失时回退 title） */
  title_i18n?: string;
  /** 列表级国际化描述（来自 crm_notice_translations；缺失时回退 description） */
  description_i18n?: string;
  /** 英文翻译回退（当前语言无译文时使用，来自 crm_notice_translations lang='en'） */
  title_en?: string;
  /** 英文翻译回退描述 */
  description_en?: string;
  // 解锁后由 /api/notices/:id/detail 补充的拓展字段
  // Extended fields provided by /api/notices/:id/detail once unlocked
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
  /** 中文版订单拆解报告可用（合格商机存在；仅解锁详情返回） */
  report_available?: boolean;
  /** 精选公告人工/AI 精加工的中文描述（列表级由 opp LEFT JOIN 返回；解锁详情同样返回） */
  description_cn?: string;
  /** 招标内容 / 投标内容概览（crm_bid_opportunities.bid_overview，列表级截断 200 字符） */
  bid_overview?: string;
  /** 受援助国（crm_bid_opportunities.beneficiary_countries，逗号分隔字符串） */
  beneficiary_countries?: string;
  /** 报告下载路径（/api/notices/:id/report，需拼 user_key；仅解锁详情返回） */
  report_url?: string;
}

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
