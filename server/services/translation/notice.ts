/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { detect as detectLangTinyld } from "tinyld";
import type { RowDataPacket } from "mysql2/promise";
import { translateViaChain, type ChainResult, type ChainSourceLang } from "./chain";
import type { NoticesRepo } from "../../repos/notices.repo";
import { preferValue } from "../../utils/json";
import { findQualifiedOpportunityForNotice } from "../notices";
import { syncWideIds } from "../noticeSearchSync";

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
// 中文原文走链时源语言标 zh（翻译链方向正确）。与前端 src/core/i18n/detectScript.ts 同构。
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
// 西里尔分支再用 tinyld 区分俄语/乌克兰语；latin 分支用 tinyld 离线检测。
// 返回 null 表示纯数字/符号/空文本，无翻译价值，调用方应跳过。
// latin 检测置信度不足/落在支持列表外 → 返回 "auto"（翻译链自动降级），
// 不再回退 "en"：旧逻辑会把荷兰/波兰/拉脱维亚语等误标英文，目标为英文时被误判直通跳过翻译。
// 支持的语言集合与 ChainSourceLang 对齐（latin 语种取 tinyld 检测可靠语种集合）。
const TINYLD_SUPPORTED = new Set([
  "en", "fr", "es", "pt", "de", "it",
  "nl", "pl", "ro", "sv", "da", "fi", "no", "hu", "tr", "et",
  "ca", "id", "ms", "vi", "tl",
]);

export function detectSourceLang(title: string, description: string): ChainSourceLang | null {
  const text = `${title}\n${description}`;
  const script = detectDominantScript(text);
  if (script === "cjk") return "zh";
  if (script === "cyrillic") {
    // 西里尔字符级无法区分俄/乌：tinyld 检为 uk 才标乌克兰语，其余保持既有 ru 行为
    return detectLangTinyld(text) === "uk" ? "uk" : "ru";
  }
  if (script === "arabic") return "ar";
  if (script === "unknown") {
    // 检测盲区（希腊/希伯来/泰文等未统计的字符区间）：含字母则标 "auto" 进链，
    // 翻译链不支持的语言自动降级；纯数字/符号才判无翻译价值
    return /\p{L}/u.test(text) ? "auto" : null;
  }
  // latin 分支：tinyld 离线检测。置信度过低或落在支持列表外 → "auto" 进链自动降级
  const detected = detectLangTinyld(text);
  if (detected && TINYLD_SUPPORTED.has(detected)) {
    return detected as ChainSourceLang;
  }
  return "auto";
}

// 公告标题+描述过链的适配器（详情端点与解锁补翻共用，与 pendingNoticeTranslations 键配套）
// sourceLang 可选传入：调用方已检测时直接复用，避免内部重复检测导致小语种误判为英文而跳过翻译。
// 未传入时内部自行检测（向后兼容）。
export function translateNoticeViaChain(
  title: string,
  description: string,
  lang: string,
  sourceLang?: ChainSourceLang
): Promise<ChainResult> {
  const detected = sourceLang ?? detectSourceLang(title, description) ?? "en";
  const alreadyTargetLang = detected === lang;
  if (alreadyTargetLang) {
    return Promise.resolve({ translations: [title, description], provider: "same-lang-passthrough" });
  }
  return translateViaChain([title, description], detected, lang);
}

// ── 翻译响应组装（从 detail.routes.ts 下沉）──

/** 翻译端点响应体 */
export interface NoticeTranslationResult {
  lang: string;
  title: string;
  description: string | null;
  cached: boolean;
  source?: string;
  passthrough?: boolean;
}

/**
 * 获取公告译文：封装缓存命中/描述补翻/全新翻译三个分支。
 * 原 detail.routes.ts 159 行翻译逻辑下沉至此，路由仅负责参数解析与 JSON 返回。
 * @throws {Error} message === "TRANSLATION_UNAVAILABLE" 时调用方应返回 503
 */
export async function getTranslatedNoticeDetail(
  noticeId: number,
  lang: string,
  noticesRepo: NoticesRepo,
  dbPool: import("mysql2/promise").Pool,
): Promise<NoticeTranslationResult> {
  // ── 分支 1：缓存命中 + 描述完整 ──
  const cachedRow = await noticesRepo.findTranslationCache(noticeId, lang);
  if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
    return handleFullCacheHit(noticeId, lang, cachedRow, noticesRepo, dbPool);
  }

  // ── 分支 1.5：标题缓存 + description_cn 可覆盖描述（zh 专属快速返回）──
  // autoTranslate 仅翻译标题（description_tr 永远 NULL），
  // 中文环境下 description_cn 可完整替代 description_tr，无需等待描述补翻。
  if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr && lang === "zh") {
    const nForZh = await noticesRepo.findDescMeta(noticeId);
    let oppForZh: RowDataPacket | null = null;
    if (nForZh) {
      oppForZh = await findQualifiedOpportunityForNotice(dbPool, nForZh) as RowDataPacket | null;
    }
    const descCnFast = oppForZh ? String(oppForZh.description_cn || "").trim() : "";
    if (descCnFast) {
      return { lang, title: cachedRow.title_tr, description: descCnFast, cached: true, source: "description_cn" };
    }
    // description_cn 不可用：回退分支 2 原有补翻逻辑
    return handleTitleOnlyCache(noticeId, lang, cachedRow, noticesRepo, dbPool);
  }

  // ── 分支 2：缓存命中 + 仅标题（描述缺失补翻）──
  if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr) {
    return handleTitleOnlyCache(noticeId, lang, cachedRow, noticesRepo, dbPool);
  }

  // ── 分支 3：全新翻译 ──
  return handleFullTranslation(noticeId, lang, noticesRepo, dbPool);
}

/** 分支 1：缓存完整——检查机会表覆盖 + 中文直出 + 重译 */
async function handleFullCacheHit(
  noticeId: number, lang: string, cachedRow: RowDataPacket,
  noticesRepo: NoticesRepo, dbPool: import("mysql2/promise").Pool,
): Promise<NoticeTranslationResult> {
  const nForCache = await noticesRepo.findDescMeta(noticeId);
  let oppForCache: RowDataPacket | null = null;
  let hasOppOverride = false;
  let cacheDescSource = nForCache?.notice_desc || "";
  if (nForCache) {
    oppForCache = await findQualifiedOpportunityForNotice(dbPool, nForCache) as RowDataPacket | null;
    if (oppForCache) {
      const oppDesc = String(oppForCache.description || "");
      if (oppDesc && oppDesc !== cacheDescSource) {
        cacheDescSource = oppDesc;
        hasOppOverride = true;
      }
    }
  }
  // 中文环境：机会表有 description_cn 时直出（零 API 成本）
  if (lang === "zh" && oppForCache && String(oppForCache.description_cn || "").trim()) {
    return { lang, title: cachedRow.title_tr, description: oppForCache.description_cn, cached: true, source: "description_cn" };
  }
  // 机会表描述覆盖了公告表描述时，翻译源已变化，需重新翻译
  if (hasOppOverride && cacheDescSource.trim()) {
    const pendingKeyStale = `notice:${noticeId}:${lang}`;
    let pendingStale = pendingNoticeTranslations.get(pendingKeyStale);
    if (!pendingStale) {
      const staleSourceLang = detectSourceLang("", cacheDescSource) ?? undefined;
      pendingStale = translateNoticeViaChain("", cacheDescSource, lang, staleSourceLang);
      pendingNoticeTranslations.set(pendingKeyStale, pendingStale);
      pendingStale.finally(() => pendingNoticeTranslations.delete(pendingKeyStale)).catch(() => undefined);
    }
    const { translations: staleTr, provider: staleProvider } = await pendingStale;
    if (staleProvider !== "same-lang-passthrough") {
      await noticesRepo.updateTranslationDescription(noticeId, lang, staleTr[1], staleProvider);
    }
    return { lang, title: cachedRow.title_tr, description: staleTr[1], cached: false, source: "opp_retranslate" };
  }
  return { lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true };
}

/** 分支 2：仅标题缓存——描述补翻 */
async function handleTitleOnlyCache(
  noticeId: number, lang: string, cachedRow: RowDataPacket,
  noticesRepo: NoticesRepo, dbPool: import("mysql2/promise").Pool,
): Promise<NoticeTranslationResult> {
  const n = await noticesRepo.findDescMeta(noticeId);
  let descSource = n?.notice_desc || "";
  let oppForDesc: RowDataPacket | null = null;
  if (n) {
    oppForDesc = await findQualifiedOpportunityForNotice(dbPool, n) as RowDataPacket | null;
    if (oppForDesc) descSource = String(preferValue(oppForDesc.description, descSource));
  }
  // 中文环境：机会表有 description_cn 时直出 + 异步补翻
  if (lang === "zh" && oppForDesc && String(oppForDesc.description_cn || "").trim()) {
    void (async () => {
      try {
        const descSourceLang = detectSourceLang("", String(descSource)) ?? undefined;
        const descOnlyResult = await translateNoticeViaChain("", String(descSource), lang, descSourceLang);
        if (descOnlyResult.provider !== "same-lang-passthrough" && descOnlyResult.translations[1]) {
          await noticesRepo.updateTranslationDescription(noticeId, lang, descOnlyResult.translations[1], descOnlyResult.provider);
        }
      } catch { /* 异步补翻失败不影响用户 */ }
    })();
    return { lang, title: cachedRow.title_tr, description: oppForDesc.description_cn, cached: true, source: "description_cn" };
  }
  if (!String(descSource || "").trim()) {
    return { lang, title: cachedRow.title_tr, description: null, cached: true };
  }
  const pendingKeyDesc = `notice:${noticeId}:${lang}:desc`;
  let pendingDesc = pendingNoticeTranslations.get(pendingKeyDesc);
  if (!pendingDesc) {
    const descSourceLang = detectSourceLang("", String(descSource)) ?? undefined;
    pendingDesc = translateNoticeViaChain("", String(descSource), lang, descSourceLang);
    pendingNoticeTranslations.set(pendingKeyDesc, pendingDesc);
    pendingDesc.finally(() => pendingNoticeTranslations.delete(pendingKeyDesc)).catch(() => undefined);
  }
  const { translations: descTranslations, provider: descProvider } = await pendingDesc;
  const descTr = descTranslations[1];
  if (descProvider === "same-lang-passthrough") {
    return { lang, title: cachedRow.title_tr, description: descTr, cached: false, passthrough: true };
  }
  await noticesRepo.updateTranslationDescription(noticeId, lang, descTr, descProvider);
  return { lang, title: cachedRow.title_tr, description: descTr, cached: false };
}

/** 分支 3：全新翻译——源语言检测 + 翻译链 + 缓存 + 英文中枢兗底 */
async function handleFullTranslation(
  noticeId: number, lang: string,
  noticesRepo: NoticesRepo, dbPool: import("mysql2/promise").Pool,
): Promise<NoticeTranslationResult> {
  const notice = await noticesRepo.findForTranslation(noticeId);
  if (!notice) {
    throw new Error("NOTICE_NOT_FOUND");
  }
  const opp = await findQualifiedOpportunityForNotice(dbPool, notice) as RowDataPacket | null;
  const mergedDescription = opp
    ? String(preferValue(opp.description, notice.description || ""))
    : String(notice.description || "");
  // 中文环境 + 机会表有 description_cn：描述直出，仅翻译标题
  const zhDescCn = lang === "zh" && opp && String(opp.description_cn || "").trim() ? opp.description_cn : null;
  // 统一检测源语言一次，后续主翻译 + 英文中枢兗底复用
  const detectedSourceLang = detectSourceLang(String(notice.title || ""), mergedDescription) ?? undefined;

  // ── 快速路径：中文 + description_cn + 原文已是中文标题 → 零 API 调用 ──
  if (zhDescCn && detectedSourceLang === "zh") {
    // 标题已是中文，无需翻译；仅缓存标题（description_cn 不存入翻译缓存表）
    await noticesRepo.upsertTranslation(noticeId, "zh", String(notice.title || ""), null, "same-lang-passthrough");
    // 通过统一路径同步宽表（宽表写入单一路径：syncWideIds）
    void syncWideIds(dbPool, [noticeId]).catch(() => {});
    return { lang: "zh", title: String(notice.title || ""), description: zhDescCn, cached: false, source: "description_cn", passthrough: true };
  }

  // ── 快速路径：中文 + description_cn + 原文非中文标题 → 原文标题立即返回 + 异步翻译标题 ──
  // 描述走 description_cn 零成本，标题翻译不阻塞当前响应（下次访问命中缓存）
  if (zhDescCn && detectedSourceLang && detectedSourceLang !== "zh") {
    void (async () => {
      try {
        const titleResult = await translateNoticeViaChain(String(notice.title || ""), "", lang, detectedSourceLang);
        if (titleResult.provider !== "same-lang-passthrough" && titleResult.translations[0]) {
          await noticesRepo.upsertTranslation(noticeId, lang, titleResult.translations[0], null, titleResult.provider);
          // 通过统一路径同步宽表（宽表写入单一路径：syncWideIds）
          void syncWideIds(dbPool, [noticeId]).catch(() => {});
        }
      } catch { /* 异步标题翻译失败不影响当前响应 */ }
    })();
    return { lang, title: String(notice.title || ""), description: zhDescCn, cached: false, source: "description_cn" };
  }

  const pendingKey = `notice:${noticeId}:${lang}`;
  let pending = pendingNoticeTranslations.get(pendingKey);
  if (!pending) {
    const descForChain = zhDescCn ? "" : mergedDescription;
    pending = translateNoticeViaChain(String(notice.title || ""), descForChain, lang, detectedSourceLang);
    pendingNoticeTranslations.set(pendingKey, pending);
    pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
  }
  const started = Date.now();
  const { translations, provider, degradedFrom } = await pending;
  console.log(
    `[translate] target=notice:${noticeId} lang=${lang} provider=${provider} ms=${Date.now() - started} degraded=${degradedFrom?.join(",") || "-"}`
  );

  if (provider === "same-lang-passthrough") {
    return { lang, title: translations[0], description: zhDescCn || translations[1], cached: false, passthrough: true };
  }
  // 有 description_cn 时仅缓存标题翻译，描述走 description_cn 直出
  const descToCache = zhDescCn ? null : translations[1];
  await noticesRepo.upsertTranslation(noticeId, lang, translations[0], descToCache, provider);

  // 英文中枢兗底：小语种公告自动补齐英文译文
  if (lang !== "en" && detectedSourceLang && detectedSourceLang !== "en" && detectedSourceLang !== "zh") {
    void (async () => {
      try {
        if (await noticesRepo.hasTranslation(noticeId, "en")) return;
        const enPendingKey = `notice:${noticeId}:en`;
        if (pendingNoticeTranslations.has(enPendingKey)) return;
        const enPromise = translateNoticeViaChain(String(notice.title || ""), mergedDescription, "en", detectedSourceLang);
        pendingNoticeTranslations.set(enPendingKey, enPromise);
        enPromise.finally(() => pendingNoticeTranslations.delete(enPendingKey)).catch(() => undefined);
        const enResult = await enPromise;
        if (enResult.provider !== "same-lang-passthrough") {
          await noticesRepo.upsertEnPivotTranslation(noticeId, enResult.translations[0] || null, enResult.translations[1] || null, enResult.provider);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[translate] en-pivot failed target=notice:${noticeId}: ${msg}`);
      }
    })();
  }

  return { lang, title: translations[0], description: zhDescCn || translations[1], cached: false, source: zhDescCn ? "description_cn" : "chain" };
}

