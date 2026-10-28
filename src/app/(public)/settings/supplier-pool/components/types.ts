/**
 * 供应商资源库页 — 共享类型（自 page-client.tsx 拆出）。
 *
 * @module app/(public)/settings/supplier-pool/components/types
 */

/** 资源库行（GET /api/user/supplier-pool 的 list 项）。
 *  2026-10-28 命名红线②：服务端以前直透列名/SQL 别名（pool_id / supplier_id /
 *  has_qualification / created_at），现在走 service 视图 camelCase，不保留名称桥。 */
export interface PoolItem {
  poolId: number;
  supplierId: number | null;
  company: string;
  industry: string;
  /** 是否已有 v2 诊断（0/1，值口径未改） */
  hasQualification: number;
  notes: string | null;
  source: string;
  createdAt: string;
}

/** 候选搜索项（/api/user/supplier-pool/search 返回；旧名 in_pool 已收 inPool） */
export interface PoolCandidate {
  id: number;
  company: string;
  industry: string;
  inPool: number;
}
