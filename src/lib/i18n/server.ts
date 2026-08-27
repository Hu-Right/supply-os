/**
 * per-request i18next 实例（服务端）
 *
 * @module lib/i18n/server
 * @description 每个请求创建一个独立的 i18next 实例，避免并发冲突。
 *              语言决议优先级：Cookie (supply_os_locale) > Accept-Language header > "en"。
 *              注意：Proxy 设置的 x-locale 是响应头，Server Component 的 headers()
 *              只能读取请求头，因此此处直接从 Cookie 读取（服务端可访问）。
 */
import { cookies, headers } from "next/headers";
import { SERVER_BUNDLES, SUPPORTED_LOCALE_CODES, type Locale } from "@/core/i18n/bundles";
import * as i18nextModule from "i18next";

type I18nInstance = {
  t: (key: string, options?: Record<string, unknown>) => string;
  init: (options: Record<string, unknown>) => Promise<void>;
};

// 将 SERVER_BUNDLES 转为 i18next 期望的 resources 格式
const RESOURCES = Object.fromEntries(
  Object.entries(SERVER_BUNDLES).map(([lang, data]) => [
    lang,
    Object.fromEntries(
      Object.entries(data).map(([ns, translations]) => [
        ns,
        { translation: translations },
      ]),
    ),
  ]),
) as Record<string, Record<string, { translation: Record<string, string> }>>;

export type { Locale };

/**
 * 从当前请求获取服务端翻译函数和语言信息。
 * 需在 Server Component 中调用（需 await）。
 */
export async function getServerI18n(): Promise<{ t: I18nInstance["t"]; locale: Locale }> {
  // ★ 直接从 Cookie 读取语言偏好（服务端可访问，无需依赖 Proxy 响应头）★
  const cookieStore = await cookies();
  let locale = (cookieStore.get("supply_os_locale")?.value) as Locale | undefined;

  // fallback: Accept-Language header
  if (!locale || !SUPPORTED_LOCALE_CODES.includes(locale)) {
    const headersList = await headers();
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
    resources: RESOURCES,
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
