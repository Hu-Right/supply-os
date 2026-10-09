/**
 * 供应商页面常量
 * @module features/supplier/pages/SupplierPage/constants
 */

/** 搜索 Tab 定义 */
export const SEARCH_TABS = [
  { key: "product", labelKey: "supplierTabProduct" },
  { key: "company", labelKey: "supplierTabCompany" },
  { key: "country", labelKey: "supplierTabCountry" },
  // 行业页签与其他页签不同源：它走 crm_industry_nodes 标准树，不搜 supplier.industry 自由文本，
  // 所以提示词必须单独给（用通用提示会让用户去搜自填短语，那些词树上根本不存在）。
  { key: "industry", labelKey: "supplierTabIndustry", placeholderKey: "supplierSearchPlaceholderIndustry" },
  { key: "certification", labelKey: "supplierTabCertification" },
  { key: "factory", labelKey: "supplierTabFactory" },
  { key: "unspsc", labelKey: "supplierTabUnspsc" },
] as const;

/** 当前页签的专用输入提示（无则用通用提示 supplierSearchPlaceholder2） */
export function searchPlaceholderKey(tab: string): string | undefined {
  const hit = SEARCH_TABS.find((x) => x.key === tab);
  return hit && "placeholderKey" in hit ? hit.placeholderKey : undefined;
}

/** 排序选项 */
export const SORT_OPTIONS = [
  { value: "comprehensive", labelKey: "supplierSortComprehensive" },
  { value: "match", labelKey: "supplierSortMatch" },
  { value: "newest", labelKey: "supplierSortNewest" },
  { value: "certified", labelKey: "supplierSortCertified" },
  { value: "completeness", labelKey: "supplierSortCompleteness" },
] as const;
