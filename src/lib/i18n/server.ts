/**
 * per-request i18next 实例（服务端）
 *
 * @module lib/i18n/server
 * @description 每个请求创建一个独立的 i18next 实例，避免并发冲突。
 *              语言决议优先级：
 *                1. x-locale 请求头（由 proxy.ts 中间件设置，携带 Cookie 偏好）
 *                2. Accept-Language header
 *                3. "en" 兜底
 *
 *              ️ 调用 headers() 会使所在 Server Component 变为动态渲染。
 *                 不要在 root layout 中调用此函数（会拖垮整站 ISR/SSG）。
 *                 仅在需要服务端翻译的独立页面/组件中按需调用。
 */
import { headers } from "next/headers";
import { SERVER_BUNDLES, SUPPORTED_LOCALE_CODES, type Locale } from "@/core/i18n/bundles";
import * as i18nextModule from "i18next";

type I18nInstance = {
  t: (key: string, options?: Record<string, unknown>) => string;
  init: (options: Record<string, unknown>) => Promise<void>;
};

export type { Locale };

/**
 * 从当前请求获取服务端翻译函数和语言信息。
 * 需在 Server Component 中调用（需 await）。
 *
 * ⚠️ 此函数调用 headers()，会使所在组件变为动态渲染。
 *    不要在 root layout 中调用。
 */
export async function getServerI18n(): Promise<{ t: I18nInstance["t"]; locale: Locale }> {
  const headersList = await headers();

  // ★ 优先读 x-locale 请求头（proxy.ts 中间件基于 Cookie 设置）★
  let locale = headersList.get("x-locale") as Locale | undefined;

  // fallback: Accept-Language
  if (!locale || !SUPPORTED_LOCALE_CODES.includes(locale)) {
    const acceptLang = headersList.get("accept-language");
    if (acceptLang) {
      const primary = acceptLang.split(",")[0]?.trim().split("-")[0]?.toLowerCase();
      if (primary && SUPPORTED_LOCALE_CODES.includes(primary as Locale)) {
        locale = primary as Locale;
      }
    }
  }

  // final fallback
  if (!locale || !SUPPORTED_LOCALE_CODES.includes(locale)) {
    locale = "en";
  }

  const i18next = i18nextModule as unknown as { createInstance: () => I18nInstance };
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: "en",
    resources: SERVER_BUNDLES,
    interpolation: {
      escapeValue: false,
      prefix: "{",
      suffix: "}",
    },
    returnNull: false,
    returnObjects: false,
  });

  return { t: instance.t, locale };
}
