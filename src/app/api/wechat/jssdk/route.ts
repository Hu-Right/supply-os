/**
 * GET /api/wechat/jssdk?url=<当前页面 URL> — 微信公众号 JS-SDK 配置签名
 *
 * @module app/api/wechat/jssdk/route
 * @description 微信内置浏览器里定制「右上角分享」卡片需要前端 wx.config 的签名；
 *              access_token/jsapi_ticket 的获取与缓存全部在 lib/services/wechat/jssdk。
 *              未配置公众号（WECHAT_MP_APP_ID/SECRET）时返回 { configured: false }，
 *              前端静默退回「点右上角」引导，不报错、不阻断分享面板。
 *
 *              只签本站页面（防被当成任意 URL 的签名服务）；微信侧签名本身也绑定安全域名。
 */
import { NextRequest, NextResponse } from "next/server";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { buildJsapiSignature, isWechatMpConfigured } from "@/lib/services/wechat/jssdk";

/** 允许签名的站点 host：请求自身 host + 部署配置的站点域名 + 主站兜底 */
function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const forwarded = req.headers.get("x-forwarded-host");
  const host = forwarded || req.headers.get("host");
  if (host) hosts.add(host.split(",")[0]!.trim().toLowerCase());
  for (const key of ["NEXT_PUBLIC_SITE_URL", "SITE_URL", "APP_URL"]) {
    const value = process.env[key];
    if (!value) continue;
    try {
      hosts.add(new URL(value).host.toLowerCase());
    } catch {
      // 非法配置忽略
    }
  }
  hosts.add("osneosmart.com");
  hosts.add("www.osneosmart.com");
  return hosts;
}

export const GET = withRoute(async (req: NextRequest) => {
  const raw = String(req.nextUrl.searchParams.get("url") || "").trim();
  if (!raw) routeError(400, EC_INVALID_PARAMS, "缺少 url 参数");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    routeError(400, EC_INVALID_PARAMS, "url 参数不合法");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    routeError(400, EC_INVALID_PARAMS, "url 参数不合法");
  }
  if (!allowedHosts(req).has(target.host.toLowerCase())) {
    routeError(400, EC_INVALID_PARAMS, "只允许签名本站页面");
  }

  // 同一页面会反复打开分享面板：每个 IP 每分钟 120 次足够，超了前端走降级引导
  const limited = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 120 }, () => "wechat:jssdk");
  if (limited) return limited;

  if (!isWechatMpConfigured()) {
    return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const data = await buildJsapiSignature(`${target.origin}${target.pathname}${target.search}`);
  return NextResponse.json(
    { configured: true, ...data },
    { headers: { "Cache-Control": "no-store" } },
  );
});
