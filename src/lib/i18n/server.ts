/**
 * per-request i18next 实例（服务端）
 *
 * @module lib/i18n/server
 * @description 每个请求创建一个独立的 i18next 实例，避免并发冲突。
 *              语言决议优先级：Accept-Language header > "en"。
 *              使用 headers() 而非 cookies()：cookies() 会强制整站动态渲染，
 *              导致 ISR/SSG 全部失效（所有页面变为 ƒ）。
 *              headers() 仅使 root layout 动态，子页面仍可 ISR 缓存。
 *              客户端语言偏好由 Cookie 持久化，客户端 detectLocale() 读取。
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
 */
export async function getServerI18n(): Promise<{ t: I18nInstance["t"]; locale: Locale }> {
  // ★ 使用 headers() 而非 cookies() —— cookies() 强制整站动态渲染，ISR/SSG 全部失效 ★
  const headersList = await headers();
  const acceptLang = headersList.get("accept-language");
  let locale: Locale | undefined;

  if (acceptLang) {
    const primary = acceptLang.split(",")[0]?.trim().split("-")[0]?.toLowerCase();
    if (primary && SUPPORTED_LOCALE_CODES.includes(primary as Locale)) {
      locale = primary as Locale;
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
