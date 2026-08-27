/**
 * Next.js Middleware — 服务端语言决议
 *
 * @module middleware
 * @description 从 cookie `supply_os_locale` 或 `Accept-Language` header
 *              解析用户首选语言，写入 `x-locale` 请求头。
 *              使用请求头（而非响应头）是因为 Next.js Server Component
 *              只能读取请求头，无法读取中间件设置的响应头。
 *
 *              注意：Next.js 要求 middleware 必须位于项目根目录。
 *              旧的 src/proxy.ts 因不在正确位置而未生效。
 */
import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["zh", "en", "fr", "ru", "es", "ar"];

export function middleware(request: NextRequest) {
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

  // ★ 写入请求头（而非响应头），使 Server Component 可通过 headers() 读取 ★
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // matcher 排除 API、_next static files、favicon、assets、fonts
  matcher: ["/((?!api|_next|static|favicon\\.ico|assets|fonts).*)"],
};
