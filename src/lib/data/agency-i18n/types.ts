/**
 * 机构名 i18n 类型定义
 * Agency Name i18n Type Definitions
 *
 * @module server/data/agency-i18n/types
 */

/** 翻译结果 */
export interface PatternI18nResult {
  canonical: string;
  i18n: { zh: string; fr?: string; ru?: string; es?: string; ar?: string };
}
