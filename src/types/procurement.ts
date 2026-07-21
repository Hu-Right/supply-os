/**
 * 采购公告类型
 * Procurement Notice Types
 *
 * @module types/procurement
 * @description 采购公告实体（含 UNSPSC 编码、锁定状态）及分页响应结构
 *              Procurement notice entity (with UNSPSC codes, lock status) and paginated response
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
}

export interface NoticeResponse {
  items?: NoticeItem[];
  total?: number;
  pageSize?: number;
  page_size?: number;
}
