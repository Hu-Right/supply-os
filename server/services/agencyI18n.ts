/**
 * 机构名模式化 i18n 翻译 — Barrel Re-export（向后兼容入口）
 * Agency Name Pattern-based i18n Translation — Barrel Re-export
 *
 * @module server/services/agencyI18n
 * @deprecated 请直接从 agency/ 子模块导入
 */
export type { PatternI18nResult } from "./agency/index";
export { translateByPattern, COUNTRY_ZH, classifyAgencyType } from "./agency/index";
