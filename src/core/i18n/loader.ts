/**
 * i18n 翻译资源按需加载器
 * On-demand Translation Resource Loader
 *
 * @module core/i18n/loader
 * @description 每种语言的 JSON 通过动态 import() 按需加载，Turbopack 自动按语言分包。
 *              首屏静态内联只有 zh（client-bundles.ts）；语言检测/切换时
 *              才下载对应语言的懒加载 chunk（每语言 ~120-190KB 源文本）。
 *              On-demand per-locale resource loader: initial bundle is zh only;
 *              other locales are lazy chunks fetched on detect/switch.
 *
 *              ⚠️ 文件清单必须与 check-i18n.ts 扫描的 locales/<lang>/*.json 保持一致
 *              （2026-10 分包改造时发现旧清单缺 errors.json，已补）。
 *
 *              缓存语义（2026-11 i18n 覆盖整改）：已加载语言返回**同一份合并词包**，
 *              不再返回空对象。原先「命中缓存 → 返回 {}」要求调用方先查
 *              isLanguageLoaded 才能拿到资源，导致脱离 Provider 的场景
 *              （global-error 这类没有 LocaleProvider 的顶栏错误页）无法取词。
 */

import type { Locale } from "./types";

/** 已加载语言的合并词包缓存（同一语言只解析一次） */
const cache = new Map<string, Record<string, string>>();

/**
 * 动态加载指定语言的全部翻译 JSON 并合并
 * 每种语言生成一个独立 chunk（~36-55KB），首次切换时下载
 */
export async function loadLanguage(lang: Locale): Promise<Record<string, string>> {
  const cached = cache.get(lang);
  if (cached) return cached;

  const [common, procurement, auth, payment, membership, crm, supplier, services, learning, training, errors, ui] =
    await Promise.all([
      import(`./locales/${lang}/common.json`),
      import(`./locales/${lang}/procurement.json`),
      import(`./locales/${lang}/auth.json`),
      import(`./locales/${lang}/payment.json`),
      import(`./locales/${lang}/membership.json`),
      import(`./locales/${lang}/crm.json`),
      import(`./locales/${lang}/supplier.json`),
      import(`./locales/${lang}/services.json`),
      import(`./locales/${lang}/learning.json`),
      import(`./locales/${lang}/training.json`),
      import(`./locales/${lang}/errors.json`),
      import(`./locales/${lang}/ui.json`),
    ]);

  const merged = {
    ...common.default,
    ...procurement.default,
    ...auth.default,
    ...payment.default,
    ...membership.default,
    ...crm.default,
    ...supplier.default,
    ...services.default,
    ...learning.default,
    ...training.default,
    ...errors.default,
    ...ui.default,
  };

  cache.set(lang, merged);
  return merged;
}

/** 检查语言是否已加载 */
export function isLanguageLoaded(lang: Locale): boolean {
  return cache.has(lang);
}

/** 取已加载语言的词包（未加载返回 undefined，不触发加载） */
export function getLoadedLanguage(lang: Locale): Record<string, string> | undefined {
  return cache.get(lang);
}
