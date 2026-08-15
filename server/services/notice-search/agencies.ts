/**
 * 采购机构下拉数据源 — 向后兼容入口
 * Agency dropdown data source — Backward-compatible entry
 *
 * @module server/services/notice-search/agencies
 * @deprecated 请直接从 agencies/ 子模块导入
 */
export { refreshNoticeAgencies, getNoticeAgencies, getAgencyCacheData, clearAgenciesCache, TYPE_KEY_SQL_PATTERNS } from "./agencies/index";
