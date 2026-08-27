/**
 * 客户端 IP 提取工具（Next.js 版）
 *
 * @module lib/utils/ip
 * @description 从 server/utils/ip.ts 移植，适配 NextRequest。
 *              trust-proxy：显式取 X-Forwarded-For 最左值（客户端真实 IP）。
 *              Next.js standalone 部署通常位于反向代理后，XFF 最左侧即客户端。
 */
import "server-only";
import type { NextRequest } from "next/server";

/** 去除 IPv6 映射前缀（::ffff:1.2.3.4 → 1.2.3.4） */
function stripIpv6Prefix(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

/**
 * 从 NextRequest 中提取客户端真实 IP。
 * 显式取 XFF 最左值（与 Express trust proxy 行为不同——
 * Next.js standalone 通常部署在反向代理后，最左侧即客户端）。
 */
export function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return stripIpv6Prefix(first);
  }

  // 回退：X-Real-IP（nginx 常用）
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return stripIpv6Prefix(realIp);

  // Next.js 无 socket 地址，回退到 127.0.0.1
  return "127.0.0.1";
}
