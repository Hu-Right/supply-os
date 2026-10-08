/**
 * 客户端 IP 提取工具（Next.js 版）
 * Client IP Extraction Utility
 *
 * @module lib/utils/ip
 * @description 提取用于限流/审计的客户端 IP。
 *              现实约束：Next.js 运行时拿不到 socket 地址（旧的「仅当直连来源为内网才信任
 *              XFF」策略无法实现，对应函数已作为死代码删除），因此本函数直接信任基础设施
 *              写入的 X-Forwarded-For，取最右侧第 TRUSTED_PROXY_HOPS 个条目（默认 1）。
 *              安全含义：若应用直接暴露给公网且前置代理不覆写 XFF，客户端可自行伪造该头。
 *              部署前置必须保证代理只追加、不信任客户端自带的 XFF。
 *              无 XFF 时回退 127.0.0.1（同机直连）。
 */

/** 去除 IPv6 映射前缀（::ffff:1.2.3.4 → 1.2.3.4） */
function stripIpv6Prefix(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

/**
 * 从 NextRequest 中提取客户端真实 IP
 *
 * 策略：
 * 1. 有 X-Forwarded-For 时，从右侧取第 TRUSTED_PROXY_HOPS 个条目（默认 1，即最近代理记录的客户端 IP）；
 *    条目里的 IPv6 映射前缀会被剥掉，空条目过滤；
 * 2. 无可用 XFF 时回退 "127.0.0.1"。
 *
 * @param req - NextRequest 请求对象
 * @returns 客户端 IP 字符串（IPv4 或 IPv6）
 */
export function extractClientIp(req: Request): string {
  const xffRaw = req.headers.get("x-forwarded-for");
  const hasXff = typeof xffRaw === "string" && xffRaw.trim().length > 0;

  // Next.js 运行时：无法直接获取 socket 地址，
  // 在标准部署（Vercel / Docker + 反向代理）下 XFF 由基础设施写入，可信。
  if (hasXff) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1) || 1);
    const parts = xffRaw.split(",").map((s) => stripIpv6Prefix(s.trim())).filter(Boolean);
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - hops);
      if (parts[idx]) return parts[idx];
    }
  }

  return "127.0.0.1";
}
