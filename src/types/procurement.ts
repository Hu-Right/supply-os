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
  organization?: string;
  country?: string;
  deadline?: string;
  estimated_value?: string;
  description?: string;
  source_url?: string;
  unspsc_codes?: Array<{ code?: string; name?: string; description?: string }>;
  core_locked?: boolean;
  /** 锁定态拆解文件计数预览（仅数量不含清单，服务端本地差异 #19；缺失时前端回退中性提示） */
  breakdown_file_count?: number;
  unlock_type?: string;
  unlocked_at?: string;
  /** 推荐模式命中的 UNSPSC 兴趣码数（仅 /api/notices/recommended 返回） */
  match_score?: number;
  /** 推荐理由标签键（C.3.4，每卡至多 2 个；前端映射 procurement_reason_* i18n 键渲染） */
  reco_reasons?: string[];
  /** 精选公告（T-A4，本地差异 #14）：对应合格机会三路判定，列表端点批量标注 */
  // [精选功能临时禁用 2026-07-29] 字段注释停用（服务端标注与前端徽标已同步注释）
  // is_featured?: boolean;
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
