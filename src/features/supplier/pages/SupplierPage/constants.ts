/**
 * 供应商页面常量
 * @module features/supplier/pages/SupplierPage/constants
 */

/**
 * 关键词检索页签：只剩「产品 / 公司」两个真正需要模糊匹配的维度。
 * 2026-10-10 重构：国家/认证/工厂·贸易商/UNSPSC 不再是检索入口（值域要么极小、
 * 要么是干净枚举、要么是猜不到的自由写法），而「行业」从并列页签升为整页的划分轴，
 * 由 SearchPanel 的门类 chip + 行业关键词框承担。
 */
export const SEARCH_TABS = [
  { key: "product", labelKey: "supplierTabProduct" },
  { key: "company", labelKey: "supplierTabCompany" },
] as const;

/** 排序选项：只列能真正兑现的项，与 repo 的 SORT_ORDERS 白名单一致 */
export const SORT_OPTIONS = [
  { value: "newest", labelKey: "supplierSortNewest" },
  { value: "completeness", labelKey: "supplierSortCompleteness" },
] as const;
