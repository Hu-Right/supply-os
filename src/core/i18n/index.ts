/**
 * i18n 统一导出入口
 * i18n Barrel Re-export Entry
 *
 * @module core/i18n
 * @description 对外暴露 LocaleProvider、useLocale 门面及 Locale/LocaleKey 类型，
 *              隐藏底层 react-i18next 引擎细节。消费方统一通过 `@/core/i18n` 引入。
 *              Public facade for i18n. Consumers import from `@/core/i18n` only.
 */

export { LocaleProvider, useLocale } from "./LocaleContext";
export type { Locale, LocaleKey } from "./types";
