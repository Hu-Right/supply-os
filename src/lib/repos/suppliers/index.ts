/**
 * 供应商数据访问层 — 统一导出入口
 * Supplier Repositories — Unified Export Entry
 *
 * @module server/repos/suppliers
 * @description 按限界上下文拆分的供应商子 Repo 统一导出：
 *              - supplier-directory: supplier 外部表（目录/企业信息唯一数据源）
 *              - supplier-claim: crm_supplier_claims 表
 */

export { SupplierDirectoryRepo } from "./supplier-directory.repo";
export type { SupplierDirectoryRow } from "./supplier-directory.repo";
export { SupplierClaimRepo } from "./supplier-claim.repo";
