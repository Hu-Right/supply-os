/**
 * 支持语言元数据注册表
 * Supported Locale Metadata Registry
 *
 * @module core/i18n/locales
 * @description 集中声明界面支持语言的元数据（母语自称、英文名、书写方向）：
 *              联合国 6 种官方语言 + 葡语（2026-10-28 面向巴西/葡语市场新增）。
 *              语言下拉框、detectLocale、RTL 同步均以此为唯一数据源。
 *              Single source of truth for the UI locales (6 UN official languages + Portuguese).
 *              注：本表是「界面语言」，与公告内容译文白名单 NOTICE_API_LANGS /
 *              宽表列 SUPPORTED_LANGS（均无 pt）不是同一口径，二者不可互相代替。
 */

import type { Locale } from "./types";

export interface LocaleMeta {
  /** 语言代码（与 Locale 类型一致） */
  code: Locale;
  /** 母语自称，用于下拉框展示 */
  nativeName: string;
  /** 英文名，用于 aria-label / 可访问性 */
  englishName: string;
  /** 书写方向：阿拉伯语为 rtl，其余 ltr */
  dir: "ltr" | "rtl";
}

// 顺序即下拉框展示顺序。zh/en 在前（当前已有完整翻译），pt 紧跟其后（新增市场位）。
// 其余按联合国常用序排列。
export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
  { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  // pt（2026-10-28）：面向巴西/葡语市场新增，仅 UI 层；公告内容翻译回落英文
  // （pt 不进 NOTICE_API_LANGS / SUPPORTED_LANGS，见 shared/constants/langs.ts）。
  { code: "pt", nativeName: "Português", englishName: "Portuguese", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
];

/** 全部支持的语言代码数组（供 detectLocale / 校验使用） */
export const SUPPORTED_LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code) as Locale[];

/** 按 code 查方向；未知语言默认 ltr */
export function getLocaleDir(code: string): "ltr" | "rtl" {
  return SUPPORTED_LOCALES.find((l) => l.code === code)?.dir ?? "ltr";
}
