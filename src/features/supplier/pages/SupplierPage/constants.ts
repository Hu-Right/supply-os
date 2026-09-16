/**
 * 供应商页面常量
 * @module features/supplier/pages/SupplierPage/constants
 */

/** 搜索 Tab 定义 */
export const SEARCH_TABS = [
  { key: "product", labelKey: "supplierTabProduct" },
  { key: "company", labelKey: "supplierTabCompany" },
  { key: "country", labelKey: "supplierTabCountry" },
  { key: "industry", labelKey: "supplierTabIndustry" },
  { key: "certification", labelKey: "supplierTabCertification" },
  { key: "factory", labelKey: "supplierTabFactory" },
  { key: "unspsc", labelKey: "supplierTabUnspsc" },
] as const;

/** 排序选项 */
export const SORT_OPTIONS = [
  { value: "comprehensive", labelKey: "supplierSortComprehensive" },
  { value: "match", labelKey: "supplierSortMatch" },
  { value: "newest", labelKey: "supplierSortNewest" },
  { value: "certified", labelKey: "supplierSortCertified" },
  { value: "completeness", labelKey: "supplierSortCompleteness" },
] as const;
