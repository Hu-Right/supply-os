/**
 * 供应商 ID 解析工具
 *
 * @module lib/utils/supplier-id
 * @description 解析供应商 ID（支持 sup-db-xxx 格式和纯数字格式）
 */

/** 解析供应商 ID（去除 sup-db- 前缀，转为数字） */
export function parseSupplierId(rawId: string): number | null {
  const numericId = Number(rawId.replace(/^sup-db-/, ""));
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
}

/** 格式化供应商 ID（添加 sup-db- 前缀） */
export function formatSupplierId(numericId: number): string {
  return `sup-db-${numericId}`;
}
