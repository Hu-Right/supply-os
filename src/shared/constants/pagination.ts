/**
 * 分页常量
 * Pagination constants
 *
 * @module shared/constants/pagination
 * @description 通用分页大小。原位于 features/procurement/constants.ts，
 *              现提取至 shared 层，消除 supplier→procurement 的跨 feature 耦合。
 */

/** 列表分页大小（供应商列表等通用） */
export const PAGE_SIZE = 9;

/** 计算总页数（至少 1 页）——收编 useOrderHistory/useSearchResults/SupplierPage 的重复公式 */
export function calcTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
