/**
 * 客户端 IP 提取工具
 * Client IP Extraction Utility
 *
 * @module server/utils/ip
 * @description 安全提取客户端真实 IP。
 *              依赖 Express trust proxy 设置正确处理 X-Forwarded-For。
 *              当 trust proxy 未配置时，回退到 socket remoteAddress。
 */
import type { Request } from "express";

/**
 * 从请求中提取客户端真实 IP
 * 
 * 优先级：
 * 1. req.ip（Express 在 trust proxy 模式下自动处理 X-Forwarded-For）
 * 2. req.socket.remoteAddress（直连 IP）
 * 3. 回退到 "127.0.0.1"
 * 
 * @param req - Express 请求对象
 * @returns 客户端 IP 字符串（IPv4 或 IPv6）
 */
export function extractClientIp(req: Request): string {
  // Express 在 trust proxy 启用时，req.ip 自动取 X-Forwarded-For 第一个有效 IP
  if (req.ip) {
    // 移除 IPv6 映射前缀（如 ::ffff:192.168.1.1 → 192.168.1.1）
    const ip = req.ip.replace(/^::ffff:/, "");
    if (ip && ip !== "127.0.0.1" && ip !== "::1") {
      return ip;
    }
  }

  // 回退到 socket remoteAddress
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) {
    return socketIp.replace(/^::ffff:/, "");
  }

  return "127.0.0.1";
}
