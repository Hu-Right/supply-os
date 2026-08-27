/**
 * per-request i18next 实例（服务端）
 *
 * @module lib/i18n/server
 * @description 每个请求创建一个独立的 i18next 实例，避免并发冲突。
 *              使用 middleware 传入的 x-locale header 作为语言参数。
 */
import type { NextRequest } from "next/server";
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
export async function getServerI18n(
  request?: NextRequest,
): Promise<{ t: I18nInstance["t"]; locale: Locale }> {
  // 从 headers() 读取 x-locale（来自 middleware）
  const { headers } = await import("next/headers");
  const headersList = await headers();
  let locale = (headersList.get("x-locale") || "en") as Locale;

  if (!SUPPORTED_LOCALE_CODES.includes(locale)) {
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
