/**
 * 供应商国际招投标能力初筛表单 API — 向后兼容 re-export
 * Supplier Qualification Form API — Backward-compatible re-export
 *
 * @module features/procurement/api/qualification
 * @description 权威实现已提升至 shared/api/qualification.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/api/qualification 导入。
 */
export { submitSupplierQualification } from "@/shared/api/qualification";
export type { SupplierQualificationForm } from "@/shared/api/qualification";
