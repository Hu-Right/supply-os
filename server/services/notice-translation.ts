/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { translateNoticeText } from "./translation/gemini";
import { translateViaChain, type ChainResult } from "./translation/chain";

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

// 公告标题+描述过链的适配器（详情端点与解锁补翻共用，与 pendingNoticeTranslations 键配套）
export function translateNoticeViaChain(
  title: string,
  description: string,
  lang: string
): Promise<ChainResult> {
  // 本地差异 #18：内容语言检测——原文已是目标语言时直通返回不进翻译链：
  // cjk/cyrillic/arabic 与语言一一对应；latin 仅 en 视为已达标（fr/es 字符级无法与英文区分，仍过链）
  const sourceScript = detectDominantScript(`${title}\n${description}`);
  const targetScript = NOTICE_LANG_SCRIPT[lang] || "latin";
  const alreadyTargetLang = sourceScript !== "unknown" && sourceScript === targetScript &&
    (targetScript !== "latin" || lang === "en");
  if (alreadyTargetLang) {
    return Promise.resolve({ translations: [title, description], provider: "same-lang-passthrough" });
  }
  // 源语言动态化（原硬编码 "en"）：中文原文标 zh 保证有道通道方向正确；
  // 其余文字系统仍标 en（罕见场景，有道不匹配时自然落 DeepSeek/Gemini 兜底，二者不依赖源语言声明）
  const sourceLang = sourceScript === "cjk" ? "zh" as const : "en" as const;
  return translateViaChain([title, description], sourceLang, lang, async () => {
    const result = await translateNoticeText(title, description, NOTICE_TRANSLATION_LANGS[lang]);
    return [result.title, result.description];
  });
}

