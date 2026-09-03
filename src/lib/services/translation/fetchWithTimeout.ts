/**
 * 翻译通道超时守护：为 fetch 加 AbortController 截止时间 + 出站 URL 净化。
 *
 * - 超时统一抛 Error("CHANNEL_TIMEOUT")，落入链上既有 catch 降级路径；
 * - URL 不合法/指向内网统一抛 Error("CHANNEL_URL_BLOCKED")，同走降级路径。
 */
import { z } from "zod";

/** 出站 URL 净化 schema：仅 http/https 公网地址（拒绝环回/私有/保留段/十进制 IP 编码/userinfo） */
export const OutboundUrlSchema = z.string().superRefine((raw, ctx) => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    ctx.addIssue({ code: "custom", message: "CHANNEL_URL_INVALID" });
    return;
  }
  // IPv6 字面量的 hostname 带方括号（如 [::1]），剥除后统一判断
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blocked =
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    Boolean(parsed.username || parsed.password) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(host) || // IPv6 ULA fc00::/7
    /^fe[89ab][0-9a-f]:/.test(host) || // IPv6 link-local fe80::/10
    /^\d+$/.test(host) || // 纯数字主机名 = 十进制 IP 编码（如 2130706433）
    /^127(\.\d{1,3}){3}$/.test(host) || // 环回
    /^10(\.\d{1,3}){3}$/.test(host) || // 私有 A 段
    /^192\.168(\.\d{1,3}){2}$/.test(host) || // 私有 C 段
    /^172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}$/.test(host) || // 私有 B 段
    /^169\.254(\.\d{1,3}){2}$/.test(host) || // 链路本地
    /^0\.0\.0\.0$/.test(host); // 未指定地址
  if (blocked) ctx.addIssue({ code: "custom", message: "CHANNEL_URL_BLOCKED" });
});

/** 独立校验入口（供测试与调用方复用）；非法抛 CHANNEL_URL_* */
export function assertPublicHttpUrl(rawUrl: string): void {
  const result = OutboundUrlSchema.safeParse(rawUrl);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "CHANNEL_URL_INVALID");
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  // zod 净化解流入 fetch：出站地址仅允许公网 http(s)，防止 env/上游数据导向内网（SSRF）
  const safeUrl = OutboundUrlSchema.safeParse(url);
  if (!safeUrl.success) {
    throw new Error(safeUrl.error.issues[0]?.message ?? "CHANNEL_URL_BLOCKED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // race 兜底：即使底层 fetch 实现忽略 signal（如测试替身），超时仍能触发
    return await Promise.race([
      fetch(safeUrl.data, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("CHANNEL_TIMEOUT")),
          { once: true }
        );
      }),
    ]);
  } catch (err: unknown) {
    if (controller.signal.aborted) throw new Error("CHANNEL_TIMEOUT", { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
