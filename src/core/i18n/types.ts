/**
 * 从 zh 合并资源推导出的所有翻译 key 联合类型。
 * t() 函数调用时 TypeScript 会自动补全。
 */
import type { zh } from "./resources";

export type LocaleKey = keyof zh;

export type Locale = "zh" | "en" | "fr" | "ru" | "es" | "ar";
