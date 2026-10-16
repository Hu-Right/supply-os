/**
 * 供应商资源库页 — 共享类型（自 page-client.tsx 拆出）。
 *
 * @module app/(public)/settings/supplier-pool/components/types
 */

/** 资源库行（/api/user/supplier-pool 返回） */
export interface PoolItem {
  pool_id: number;
  supplier_id: number | null;
  company: string;
  industry: string;
  has_qualification: number;
  notes: string | null;
  source: string;
  created_at: string;
}

/** 候选搜索项（/api/user/supplier-pool/search 返回） */
export interface PoolCandidate {
  id: number;
  company: string;
  industry: string;
  in_pool: number;
}
