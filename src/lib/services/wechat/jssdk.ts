/**
 * 微信公众号 JS-SDK 签名
 * @module lib/services/wechat/jssdk
 *
 * @description 微信内置浏览器里，「右上角 → 发送给朋友/分享到朋友圈」的卡片内容
 *             只能通过 JS-SDK 的 updateAppMessageShareData / updateTimelineShareData 定制。
 *              本模块负责：
 *               1. 用公众号 AppID/AppSecret 换 access_token（7200s）；
 *               2. 用 access_token 换 jsapi_ticket（7200s）；
 *               3. 按 sha1(jsapi_ticket&noncestr&timestamp&url) 生成前端 wx.config 所需签名。
 *
 *              凭据只从 env 读：WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET（与微信支付商户号无关）。
 *              未配置时 buildJsapiSignature 返回 null，前端静默退回「点右上角」引导。
 *
 *              缓存放 globalThis：dev 热重载不重复取 token（微信侧对 token 获取有频率限制）。
 */
import crypto from "node:crypto";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const TICKET_URL = "https://api.weixin.qq.com/cgi-bin/ticket/getticket";
/** 提前 5 分钟过期，避免边界时刻用过期票据签名 */
const EXPIRY_SKEW_MS = 5 * 60_000;

interface CachedValue {
  value: string;
  expiresAt: number;
}

interface WxMpCache {
  appId: string;
  token?: CachedValue;
  ticket?: CachedValue;
}

const globalForWx = globalThis as unknown as { __wxMpCache?: WxMpCache };

export interface JsapiSignature {
  appId: string;
  /** 秒级时间戳 */
  timestamp: number;
  nonceStr: string;
  signature: string;
}

function credentials(): { appId: string; appSecret: string } | null {
  const appId = process.env.WECHAT_MP_APP_ID?.trim();
  const appSecret = process.env.WECHAT_MP_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

export function isWechatMpConfigured(): boolean {
  return credentials() !== null;
}

function cacheFor(appId: string): WxMpCache {
  if (!globalForWx.__wxMpCache || globalForWx.__wxMpCache.appId !== appId) {
    globalForWx.__wxMpCache = { appId };
  }
  return globalForWx.__wxMpCache;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(`WECHAT_HTTP_${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const cache = cacheFor(appId);
  if (cache.token && cache.token.expiresAt > Date.now()) return cache.token.value;
  const body = await fetchJson(
    `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
  );
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error(`WECHAT_TOKEN_FAILED: ${String(body.errcode ?? "")} ${String(body.errmsg ?? "")}`.trim());
  }
  const expiresIn = Number(body.expires_in ?? 7200);
  cache.token = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000 - EXPIRY_SKEW_MS,
  };
  return body.access_token;
}

async function getJsapiTicket(appId: string, appSecret: string): Promise<string> {
  const cache = cacheFor(appId);
  if (cache.ticket && cache.ticket.expiresAt > Date.now()) return cache.ticket.value;
  const accessToken = await getAccessToken(appId, appSecret);
  const body = await fetchJson(
    `${TICKET_URL}?access_token=${encodeURIComponent(accessToken)}&type=jsapi`,
  );
  if (typeof body.ticket !== "string" || !body.ticket) {
    throw new Error(`WECHAT_TICKET_FAILED: ${String(body.errcode ?? "")} ${String(body.errmsg ?? "")}`.trim());
  }
  const expiresIn = Number(body.expires_in ?? 7200);
  cache.ticket = {
    value: body.ticket,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000 - EXPIRY_SKEW_MS,
  };
  return body.ticket;
}

/**
 * 生成 wx.config 签名。未配置公众号时返回 null（调用方走降级引导）。
 * @param url 当前页面完整 URL（不含 #hash），必须与微信内实际页面一致
 */
export async function buildJsapiSignature(url: string): Promise<JsapiSignature | null> {
  const creds = credentials();
  if (!creds) return null;

  const ticket = await getJsapiTicket(creds.appId, creds.appSecret);
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  // 微信要求按字段名字典序拼接：jsapi_ticket、noncestr、timestamp、url（当前顺序即字典序）
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash("sha1").update(raw, "utf8").digest("hex");

  return { appId: creds.appId, timestamp, nonceStr, signature };
}
