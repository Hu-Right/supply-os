/**
 * 供应商页面常量
 * @module features/supplier/pages/SupplierPage/constants
 */

/** 排序选项：只列能真正兑现的项，与 repo 的 SORT_ORDERS 白名单一致 */
export const SORT_OPTIONS = [
  { value: "newest", labelKey: "supplierSortNewest" },
  { value: "completeness", labelKey: "supplierSortCompleteness" },
] as const;
