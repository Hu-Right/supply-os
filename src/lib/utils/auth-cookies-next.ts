/**
 * Next.js Route Handler 认证 Cookie 工具
 *
 * 对应 Express 的 src/lib/utils/auth-cookies.ts，
 * 使用 Next.js Request/Response API 操作 HttpOnly Cookie。
 */

const REFRESH_COOKIE_NAME = "supply_os_refresh_token";
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

/** NextRequest 携带的 cookies API 结构（标准 Request 无此属性，用于安全收窄） */
interface RequestWithCookies {
  cookies?: { get: (name: string) => { value?: string } | string | undefined };
}

/** 构建 Set-Cookie 头字符串 */
function buildCookieHeader(name: string, value: string, maxAgeSec: number): string {
  const parts = [
    `${name}=${value}`,
    "HttpOnly",
    "SameSite=Strict",
    `Path=/api/auth`,
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** 在 NextResponse 上设置 Refresh Token Cookie */
export function setRefreshCookieOnResponse(response: Response, refreshToken: string): void {
  response.headers.append("Set-Cookie", buildCookieHeader(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_MAX_AGE));
}

/** 在 NextResponse 上清除 Refresh Token Cookie */
export function clearRefreshCookieOnResponse(response: Response): void {
  response.headers.append("Set-Cookie", buildCookieHeader(REFRESH_COOKIE_NAME, "", 0));
}

/** 从 NextRequest 读取 Refresh Token Cookie */
export function readRefreshCookieFromRequest(req: Request): string {
  // NextRequest 的 cookies API
  const withCookies = req as Request & RequestWithCookies;
  if ("cookies" in req && typeof withCookies.cookies?.get === "function") {
    const cookie = withCookies.cookies.get(REFRESH_COOKIE_NAME);
    if (cookie) return typeof cookie === "string" ? cookie : cookie.value || "";
  }
  // 回退：手动解析 Cookie 头
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1]).trim() : "";
}
