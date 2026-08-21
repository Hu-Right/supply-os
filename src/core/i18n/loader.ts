/**
 * i18n 翻译资源按需加载器
 * On-demand Translation Resource Loader
 *
 * @module core/i18n/loader
 * @description 每种语言的 JSON 通过动态 import() 按需加载，Vite 自动按语言分包。
 *              首屏仅加载当前语言 + 英文兜底，其余语言在用户切换时才下载。
 *              Each language's JSON is loaded via dynamic import() → separate chunk per language.
 *              Initial load: detected language + English fallback only.
 */

import type { Locale } from "./types";

/** 已加载语言缓存，避免重复请求 */
const loaded = new Set<string>();

/**
 * 动态加载指定语言的全部翻译 JSON 并合并
 * 每种语言生成一个独立 chunk（~36-55KB），首次切换时下载
 */
export async function loadLanguage(lang: Locale): Promise<Record<string, string>> {
  if (loaded.has(lang)) return {};

  const [common, procurement, auth, payment, membership, crm, supplier, showroom, services, learning, training] =
    await Promise.all([
      import(`./locales/${lang}/common.json`),
      import(`./locales/${lang}/procurement.json`),
      import(`./locales/${lang}/auth.json`),
      import(`./locales/${lang}/payment.json`),
      import(`./locales/${lang}/membership.json`),
      import(`./locales/${lang}/crm.json`),
      import(`./locales/${lang}/supplier.json`),
      import(`./locales/${lang}/showroom.json`),
      import(`./locales/${lang}/services.json`),
      import(`./locales/${lang}/learning.json`),
      import(`./locales/${lang}/training.json`),
    ]);

  const merged = {
    ...common.default,
    ...procurement.default,
    ...auth.default,
    ...payment.default,
    ...membership.default,
    ...crm.default,
    ...supplier.default,
    ...showroom.default,
    ...services.default,
    ...learning.default,
    ...training.default,
  };

  loaded.add(lang);
  return merged;
}

/** 检查语言是否已加载 */
export function isLanguageLoaded(lang: Locale): boolean {
  return loaded.has(lang);
}
