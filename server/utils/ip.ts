/**
 * 客户端 IP 提取工具
 * Client IP Extraction Utility
 *
 * @module server/utils/ip
 * @description 安全提取客户端真实 IP。
 *              P1-3 安全修复：仅当直连来源为可信代理（回环/内网地址或
 *              TRUSTED_PROXY_CIDRS 配置）时才信任 X-Forwarded-For，且取最右侧条目
 *              （最近可信代理写入的值）；攻击者伪造 XFF 左侧条目无法改变限流 IP。
 *              直连公网来源时忽略 XFF，直接使用 socket 地址。
 */
import type { Request } from "express";

/** 判断 IP 是否为回环/私有内网地址（可信代理的典型来源） */
function isPrivateOrLoopback(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^fc|^fd/i.test(ip) // IPv6 unique local
  );
}

/** 去除 IPv6 映射前缀（::ffff:1.2.3.4 → 1.2.3.4） */
function stripIpv6Prefix(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

/**
 * 从请求中提取客户端真实 IP
 *
 * P1-3 策略：
 * 1. 直连来源为可信代理（回环/内网）时，从 X-Forwarded-For 右侧取第
 *    TRUSTED_PROXY_HOPS 个条目（默认 1，即最近可信代理记录的客户端 IP）；
 * 2. 直连来源为公网地址时忽略 XFF（无代理部署下伪造 XFF 不影响限流）；
 * 3. 均不可用时回退 socket 地址 → "127.0.0.1"。
 *
 * @param req - Express 请求对象
 * @returns 客户端 IP 字符串（IPv4 或 IPv6）
 */
export function extractClientIp(req: Request): string {
  const socketIp = stripIpv6Prefix(req.socket?.remoteAddress || "");
  const xffRaw = req.headers["x-forwarded-for"];
  const hasXff = typeof xffRaw === "string" && xffRaw.trim().length > 0;

  // 仅当直连来源为可信代理时才解析 XFF，防止公网直连时伪造 XFF 绕过限流
  const trustedProxy = socketIp ? isPrivateOrLoopback(socketIp) : false;
  if (trustedProxy && hasXff) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1) || 1);
    const parts = (xffRaw as string).split(",").map((s) => stripIpv6Prefix(s.trim())).filter(Boolean);
    if (parts.length > 0) {
      // 右侧第 hops 个条目 = 最近可信代理写入的客户端 IP；伪造的左侧条目被跳过
      const idx = Math.max(0, parts.length - hops);
      if (parts[idx]) return parts[idx];
    }
  }

  // 不可信来源携带 XFF：忽略 XFF（含 Express req.ip，trust proxy 会解析它），直接用 socket 地址
  if (!trustedProxy && hasXff && socketIp) return socketIp;

  // 无 XFF：req.ip 与 socket 地址等价，优先 req.ip（保留原行为）
  if (req.ip) {
    const ip = stripIpv6Prefix(req.ip);
    if (ip) return ip;
  }
  if (socketIp) return socketIp;

  return "127.0.0.1";
}
