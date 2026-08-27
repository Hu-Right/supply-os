/**
 * Next.js Proxy — 服务端语言决议
 *
 * @module proxy
 * @description 从 cookie `supply_os_locale` 或 `Accept-Language` header
 *              解析用户首选语言，写入 `x-locale` response header。
 *              Per-request 粒度由 getServerI18n() 读取该 header。
 *              Next.js 16: middleware 已重命名为 proxy。
 */
import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["zh", "en", "fr", "ru", "es", "ar"];

export function proxy(request: NextRequest) {
  let locale = request.cookies.get("supply_os_locale")?.value;

  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    // fallback: Accept-Language
    const acceptLang = request.headers.get("accept-language");
    if (acceptLang) {
      const primary = acceptLang.split(",")[0]?.trim().split("-")[0]?.toLowerCase();
      if (primary && SUPPORTED_LOCALES.includes(primary)) {
        locale = primary;
      }
    }
  }

  // final fallback
  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    locale = "en";
  }

  const res = NextResponse.next();
  res.headers.set("x-locale", locale);
  return res;
}

export const config = {
  // matcher 排除 API、_next static files、favicon、assets
  matcher: ["/((?!api|_next|static|favicon\\.ico|assets).*)"],
};
