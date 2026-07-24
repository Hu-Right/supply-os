/**
 * 从 zh.json 推导出的所有翻译 key 联合类型。
 * t() 函数调用时 TypeScript 会自动补全。
 */
import zh from "./zh.json";

export type LocaleKey = keyof typeof zh;

export type Locale = "zh" | "en" | "fr" | "ru" | "es" | "ar";
