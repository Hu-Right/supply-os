/**
 * Next.js Proxy — 语言决议 + 公告 404 前置判定
 *
 * @module proxy
 * @description Next.js 16 将 middleware 更名为 proxy（Node.js 运行时，不再支持 edge）。
 *              两件事：
 *              1) 从 cookie `supply_os_locale` 或 Accept-Language 解析语言，写入 `x-locale`
 *                 请求头（Server Component 只能读请求头）；
 *              2) 公告详情页的存在性判定前移：页面正文是流式输出的，等 page 里
 *                 await 完再 notFound()，200 已经随 shell 发出去了（软 404）。
 *                 这里先查一次 notice_public 主键，不存在直接 rewrite 到 /404 并带 404 状态码。
 *
 *              查询带 10 分钟内存缓存 + 200ms 超时：DB 异常时一律放行（宁可退回软 404，
 *              也不能让公告页整体不可用）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";

const SUPPORTED_LOCALES = ["zh", "en", "fr", "ru", "es", "ar", "pt"];
const NOTICE_PATH = /^(?:\/en)?\/procurement\/notice\/([^/]+)\/?$/;

/** 存在性缓存：公告一旦存在/不存在，10 分钟内不重复查库 */
const EXISTS_TTL_MS = 10 * 60 * 1000;
const EXISTS_CACHE_MAX = 5000;
const existsCache = new Map<number, { ok: boolean; exp: number }>();

/** 查公告是否存在；超时或 DB 异常返回 null（调用方放行，不改变原行为） */
async function noticeExists(id: number): Promise<boolean | null> {
  const hit = existsCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.ok;

  try {
    const result = (await Promise.race([
      getPool().query("SELECT 1 AS ok FROM notice_public WHERE notice_pk = ? LIMIT 1", [id]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("notice-exists-timeout")), 200),
      ),
    ])) as [unknown[], unknown];
    const ok = Array.isArray(result[0]) && result[0].length > 0;
    if (existsCache.size >= EXISTS_CACHE_MAX) existsCache.clear();
    existsCache.set(id, { ok, exp: Date.now() + EXISTS_TTL_MS });
    return ok;
  } catch {
    return null;
  }
}

/** 404 兜底：rewrite 到 /404 并显式设置状态码 */
function notFoundResponse(request: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── AI 爬虫日志：只记 UA + 路径，落 pm2 日志，供后续分析引用页 ──
  const ua = request.headers.get("user-agent") ?? "";
  if (/GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web|PerplexityBot|Google-Extended|CCBot|Bytespider/i.test(ua)) {
    console.log(`[ai-crawler] ${new Date().toISOString()} ${pathname} ${ua.slice(0, 120)}`);
  }

  // ── 公告详情：格式/存在性判定（必须在流式响应开始前）──
  const noticeMatch = pathname.match(NOTICE_PATH);
  if (noticeMatch) {
    const raw = decodeURIComponent(noticeMatch[1]);
    if (!/^\d+$/.test(raw)) return notFoundResponse(request);
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffffffff) {
      return notFoundResponse(request);
    }
    const exists = await noticeExists(id);
    if (exists === false) return notFoundResponse(request);
  }

  // ── 英文站点是独立根布局（app/(en)/en），URL 前缀即语言，不读 Cookie：
  //    否则中文用户打开 /en 会被 Cookie 改回中文，hreflang 与 canonical 全部失真。
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const enHeaders = new Headers(request.headers);
    enHeaders.set("x-locale", "en");
    return NextResponse.next({ request: { headers: enHeaders } });
  }

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

  // final fallback: 主要客户为中文用户，默认使用中文
  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    locale = "zh";
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
