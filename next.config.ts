import type { NextConfig } from "next";

/**
 * 局域网调试来源白名单（仅 dev 生效）。
 *
 * Next.js 16 会拦截跨源的 dev 内部请求（见 next/dist/server/lib/router-utils/block-cross-site-dev.js）：
 * 浏览器地址栏的 host 不在名单内时，HMR WebSocket 握手被拒，页面因 JS 加载不全而无法交互。
 * 本机 LAN IP 会随 DHCP 变化，因此名单不写死在代码里：
 * 只需在 .env 设置 DEV_ALLOWED_ORIGINS（逗号分隔），改完重启 dev 即生效。
 */
const DEFAULT_DEV_ALLOWED_ORIGINS = ["172.16.2.206"];
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? DEFAULT_DEV_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  // 使用 Turbopack 作为打包工具（Next.js 16 默认，性能更优）
  // Turbopack 原生支持 Node.js builtins，无需 webpack 的 fallback/alias 配置
  turbopack: {},
  // 局域网调试来源白名单：由 .env 的 DEV_ALLOWED_ORIGINS 驱动（见文件顶部注释）
  allowedDevOrigins,
  serverExternalPackages: [
    "mysql2",
    "nodejieba",
    "@node-rs/jieba",
    "bcrypt",
    "alipay-sdk",
    "formstream",
    "@alicloud/dypnsapi20170525",
    "@alicloud/dysmsapi20170525",
    "@alicloud/openapi-client",
    "@google/genai",
    "meilisearch",
    "urllib",
    "destroy",
    "nodemailer",
    "jsonwebtoken",
    "qrcode",
    "undici",
    "httpx",
    "kitx",
    "xml2js",
    "sdk-base",
    "address",
    "agentkeepalive",
    "bowser",
    "utility",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // 优先 AVIF（体积更小），降级 WebP（兼容性更广）
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    qualities: [75, 80, 90],
  },
  // 优化大型 npm 包的 tree-shaking（减少 bundle 体积）
  experimental: {
    optimizePackageImports: ["lucide-react", "i18next", "react-i18next"],
  },
  // 安全头：CSP 收紧 + 标准安全头
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://zz.bdstatic.com https://hm.baidu.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-src 'self' https://open.alipay.com https://wx.tenpay.com",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
  generateBuildId: async () => {
    // CI 注入 BUILD_ID（github.sha），runtime 容器同步注入
    return process.env.BUILD_ID || null;
  },
};

export default nextConfig;
