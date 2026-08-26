/**
 * 机构名 i18n 静态数据 — Barrel Re-export（向后兼容层）
 * Agency Name i18n Static Data — Barrel Re-export
 *
 * @module server/services/agency-i18n-data
 * @description 数据已拆分至 server/data/agency-i18n/ 目录下的独立模块。
 *              本文件仅保留 re-export 以维持向后兼容，消费方无需修改导入路径。
 *
 * 拆分后的文件结构：
 *   data/agency-i18n/
 *   ├── types.ts            ← PatternI18nResult 类型定义
 *   ├── known-acronyms.ts   ← KNOWN_ACRONYMS（100+ 国际机构缩写）
 *   ├── country-zh.ts       ← COUNTRY_ZH + INTL_TYPE_EN
 *   ├── prefix-patterns.ts  ← BR_PREFIX_MAP / BR_EXTRA_PREFIX_MAP / KENYA_PREFIX_MAP / INTL_PREFIX_MAP
 *   ├── type-patterns.ts    ← TYPE_PATTERNS + INTL_TYPE_PATTERNS
 *   └── translate.ts        ← translateByPattern() 函数
 */

// ── 类型 ──
export type { PatternI18nResult } from "../data/agency-i18n/types";

// ── 纯数据 ──
export { KNOWN_ACRONYMS } from "../data/agency-i18n/known-acronyms";
export { COUNTRY_ZH, INTL_TYPE_EN } from "../data/agency-i18n/country-zh";

// ── RegExp 模式数据 ──
export {
  BR_PREFIX_MAP, BR_EXTRA_PREFIX_MAP, KENYA_PREFIX_MAP, INTL_PREFIX_MAP,
} from "../data/agency-i18n/prefix-patterns";
export { TYPE_PATTERNS, INTL_TYPE_PATTERNS } from "../data/agency-i18n/type-patterns";

// ── 逻辑函数 ──
export { translateByPattern } from "../data/agency-i18n/translate";
