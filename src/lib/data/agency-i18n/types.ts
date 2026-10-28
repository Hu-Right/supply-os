/**
 * 机构名 i18n 类型定义
 * Agency Name i18n Type Definitions
 *
 * @module server/data/agency-i18n/types
 */

/** 翻译结果（en 为可选可读英文名；缺省时展示侧走各自的英文回退链；i18n 为 null 表「留名不译」） */
export interface PatternI18nResult {
  canonical: string;
  i18n: { en?: string; zh: string; fr?: string; ru?: string; es?: string; ar?: string } | null;
}
