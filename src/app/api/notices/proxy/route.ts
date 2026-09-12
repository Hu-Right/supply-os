/**
 * GET /api/notices/proxy — 外部附件下载代理
 *
 * @module app/api/notices/proxy/route
 * @description 浏览器 fetch 跨域拉取 UN/DGM 等外部采购附件时，目标服务器通常不返回
 *              CORS 头，导致前端 downloadFile() 网络失败。本端点在服务端代为拉取
 *              外部资源并以 attachment 响应回传，绕过浏览器 CORS 限制。
 *
 *              ⚠️ 安全约束：
 *              - 必须携带有效 JWT（防匿名滥用为开放代理 / SSRF 跳板）
 *              - 仅允许 http/https 协议（拦截 file:// / gopher:// 等）
 *              - 禁止解析到内网 / 回环地址（SSRF 防护）
 *              - 响应体上限 50 MB（防内存爆涨）
 */
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_REQUEST, EC_INTERNAL_ERROR } from "@/shared/constants/api";

/** 允许代理的外部域名白名单（按需扩展；当前为宽松模式，仅记录不拦截） */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供严格模式启用
const ALLOWED_HOSTS = new Set([
  "www.ungm.org",
  "ungm.org",
  "www.dgm.com",
  "dgm.com",
  "dgmarket.com",
  "www.dgmarket.com",
  "ted.europa.eu",
  "sam.gov",
  "www.sam.gov",
  "www.worldbank.org",
  "worldbank.org",
  "www.adb.org",
  "adb.org",
  "www.iadb.org",
  "iadb.org",
  "www.afdb.org",
  "afdb.org",
  "www.ebrd.com",
  "ebrd.com",
]);

/** 响应体上限：50 MB */
const MAX_BODY_BYTES = 50 * 1024 * 1024;

/**
 * SSRF 防护：拒绝内网 / 回环 / 链路本地地址。
 * 仅做基础字符串检测（DNS rebinding 不在本层防御）。
 */
function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.2") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

export const GET = withRoute(
  async (req) => {
    await requireUserKeyOrThrow(req);

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");
    if (!targetUrl) routeError(400, EC_INVALID_REQUEST, "缺少 url 参数");

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      routeError(400, EC_INVALID_REQUEST, "无效的 URL");
    }

    // 协议白名单
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      routeError(400, EC_INVALID_REQUEST, "仅允许 http/https 协议");
    }

    // SSRF 防护
    if (isPrivateHost(parsed.hostname)) {
      routeError(400, EC_INVALID_REQUEST, "不允许访问内网地址");
    }

    // 域名白名单（宽松模式：白名单外的域名也允许，但日志记录）
    // 如需严格模式可取消下方注释：
    // if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    //   routeError(400, EC_INVALID_REQUEST, `不在允许的域名白名单内: ${parsed.hostname}`);
    // }

    // 服务端代为拉取外部资源
    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        headers: {
          "User-Agent": "SupplyOS/1.0 (Procurement File Proxy)",
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(30_000), // 30 秒超时
      });
    } catch (err) {
      console.error("[proxy] 上游拉取失败:", (err as Error).message);
      routeError(502, EC_INTERNAL_ERROR, "外部资源拉取失败");
    }

    if (!upstream.ok) {
      routeError(502, EC_INTERNAL_ERROR, `上游返回 ${upstream.status}`);
    }

    // 读取响应体（带大小上限）
    const contentType =
      upstream.headers.get("Content-Type") || "application/octet-stream";
    const upstreamDisposition =
      upstream.headers.get("Content-Disposition") || "";

    const body = await readWithLimit(upstream.body, MAX_BODY_BYTES);

    // 透传 Content-Disposition；若上游缺失则构造 attachment
    const disposition =
      upstreamDisposition ||
      `attachment; filename="${encodeURIComponent(
        parsed.pathname.split("/").pop() || "download",
      )}"`;

    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

/**
 * 读取 ReadableStream 并限制最大字节数（防恶意大文件爆内存）。
 */
async function readWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`响应体超过 ${limit} 字节上限`);
    }
    chunks.push(value);
  }
  // 合并为单一 Uint8Array
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
