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
  unlock_type?: string;
  unlocked_at?: string;
  /** 推荐模式命中的 UNSPSC 兴趣码数（仅 /api/notices/recommended 返回） */
  match_score?: number;
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
}
