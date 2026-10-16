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

  const [common, procurement, auth, payment, membership, crm, supplier, services, learning, training, errors] =
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
  };

  loaded.add(lang);
  return merged;
}

/** 检查语言是否已加载 */
export function isLanguageLoaded(lang: Locale): boolean {
  return loaded.has(lang);
}
