/**
 * 内容主导文字系统检测
 * Dominant script detection for business content
 *
 * @module core/i18n/detectScript
 * @description 按 Unicode 区间统计文本主导文字系统（CJK/西里尔/阿拉伯/拉丁），
 *              用于判断业务数据原文是否已是目标语言，修复"原文必为英文"的历史假设：
 *              中文原文在英文环境下应请求英文翻译，而非直接展示；
 *              中文原文在中文环境下应跳过"翻译为中文"的无效调用。
 *              Detects the dominant script of a text so the content-translation
 *              layer can skip no-op translations and request reverse ones.
 */

export type ContentScript = "cjk" | "cyrillic" | "arabic" | "latin" | "unknown";

/** 各 locale 对应的文字系统（en/fr/es 同属拉丁字母，字符级不可再分） */
const LOCALE_SCRIPT: Record<string, ContentScript> = {
  zh: "cjk",
  ru: "cyrillic",
  ar: "arabic",
  en: "latin",
  fr: "latin",
  es: "latin",
};

/**
 * 统计文本中各文字系统的字符数，返回占比最高者。
 * 数字/标点/空白不计入；全部不命中时返回 "unknown"（无法判断，调用方应保守处理）。
 */
export function detectDominantScript(text: string): ContentScript {
  let cjk = 0;
  let cyrillic = 0;
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) cjk += 1;
    else if (code >= 0x0400 && code <= 0x04ff) cyrillic += 1;
    else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) arabic += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin += 1;
  }
  const max = Math.max(cjk, cyrillic, arabic, latin);
  if (max === 0) return "unknown";
  if (max === cjk) return "cjk";
  if (max === cyrillic) return "cyrillic";
  if (max === arabic) return "arabic";
  return "latin";
}

/**
 * 判断业务原文在目标 locale 下是否需要请求内容翻译。
 *
 * 规则：
 * - 源文字系统与目标不同 → 需要翻译（含"中文原文 + 英文环境"的反向翻译场景）
 * - 同为 cjk/cyrillic/arabic（与语言一一对应）→ 原文已是目标语言，跳过
 * - 同为 latin：en 视为已达标（库存原文以英文为主的既有口径）；
 *   fr/es 字符级无法与英文区分，仍交由翻译链判定
 * - 源 unknown（纯数字/符号等）→ 不翻译，保持原文
 */
export function needsContentTranslation(sourceText: string, targetLocale: string): boolean {
  const target = LOCALE_SCRIPT[targetLocale];
  if (!target) return false;
  const source = detectDominantScript(sourceText);
  if (source === "unknown") return false;
  if (source !== target) return true;
  return target === "latin" && targetLocale !== "en";
}
