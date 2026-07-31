/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { detect as detectLangTinyld } from "tinyld";
import { translateNoticeText } from "./translation/gemini";
import { translateViaChain, type ChainResult, type ChainSourceLang } from "./translation/chain";

export const NOTICE_TRANSLATION_LANGS: Record<string, string> = {
  zh: "Simplified Chinese",
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

// ── 内容主导文字系统检测（本地差异 #18）──
// 按 Unicode 区间统计原文主导文字系统，修复翻译链"原文必为英文"的硬编码假设：
// 原文已是目标语言时直通返回（杜绝"中文翻译为中文"的无效 API 调用），
// 中文原文走链时源语言标 zh（有道通道方向正确）。与前端 src/core/i18n/detectScript.ts 同构。
type ContentScript = "cjk" | "cyrillic" | "arabic" | "latin" | "unknown";
const NOTICE_LANG_SCRIPT: Record<string, ContentScript> = {
  zh: "cjk",
  ru: "cyrillic",
  ar: "arabic",
  en: "latin",
  fr: "latin",
  es: "latin",
};
function detectDominantScript(text: string): ContentScript {
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

// 同一 (notice, lang) 的并发首次请求只触发一次翻译链调用
export const pendingNoticeTranslations = new Map<string, Promise<ChainResult>>();

// ── 源语言检测（本地差异 #19：小语种支持）──
// 分层策略：字符级可靠的先用 detectDominantScript（CJK/西里尔/阿拉伯），
// 只有 latin 分支（英/法/西/葡/德/意 字符级无法区分）才动用 tinyld 离线检测。
// 返回 null 表示纯数字/符号/空文本，无翻译价值，调用方应跳过。
// 支持的语言集合与 ChainSourceLang 对齐（en/zh/ru/ar/fr/es/pt/de/it）。
const TINYLD_SUPPORTED = new Set(["en", "fr", "es", "pt", "de", "it"]);

export function detectSourceLang(title: string, description: string): ChainSourceLang | null {
  const text = `${title}\n${description}`;
  const script = detectDominantScript(text);
  if (script === "cjk") return "zh";
  if (script === "cyrillic") return "ru";
  if (script === "arabic") return "ar";
  if (script === "unknown") return null;
  // latin 分支：tinyld 离线检测。置信度过低或落在支持列表外 → 回退 "en"
  const detected = detectLangTinyld(text);
  if (detected && TINYLD_SUPPORTED.has(detected)) {
    return detected as ChainSourceLang;
  }
  return "en";
}

// 公告标题+描述过链的适配器（详情端点与解锁补翻共用，与 pendingNoticeTranslations 键配套）
export function translateNoticeViaChain(
  title: string,
  description: string,
  lang: string
): Promise<ChainResult> {
  // 本地差异 #19：源语言动态化——引入 tinyld 后 latin 分支也能区分英/法/西/葡/德/意，
  // 不再把所有非中文原文一律标 en（法语/西语/葡语原文被误标 en 导致有道方向错误）。
  // 检测为 null 时（纯数字/符号）直通无意义，但仍返回原文避免崩链路；调用方应预先过滤。
  const sourceLang = detectSourceLang(title, description) ?? "en";
  const alreadyTargetLang = sourceLang === lang;
  if (alreadyTargetLang) {
    return Promise.resolve({ translations: [title, description], provider: "same-lang-passthrough" });
  }
  return translateViaChain([title, description], sourceLang, lang, async () => {
    const result = await translateNoticeText(title, description, NOTICE_TRANSLATION_LANGS[lang]);
    return [result.title, result.description];
  });
}

