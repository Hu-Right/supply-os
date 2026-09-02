import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 使用 Turbopack 作为打包工具（Next.js 16 默认，性能更优）
  // Turbopack 原生支持 Node.js builtins，无需 webpack 的 fallback/alias 配置
  turbopack: {},
  // Next.js 16 安全策略：允许局域网 IP 访问 dev 资源（解决 403 + WebSocket HMR 失败）
  allowedDevOrigins: ["172.16.2.206", "192.168.1.24"],
  serverExternalPackages: [
    "mysql2",
    "nodejieba",
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
    qualities: [75, 80],
  },
  // 优化大型 npm 包的 tree-shaking（减少 bundle 体积）
  experimental: {
    optimizePackageImports: ["lucide-react", "i18next", "react-i18next"],
  },
  // 根路由 301 永久重定向到 /showroom —— 长期存在的 307 会让搜索引擎
  // 视为"临时"，权重沉淀在 / 上永不转移；/showroom 是既定永久首页
  // （canonical/sitemap/导航均已指向），用 permanent: true 传递信号
  async redirects() {
    return [
      {
        source: "/",
        destination: "/showroom",
        permanent: true,
      },
    ];
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
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-src 'self' https://open.alipay.com https://wx.tenpay.com",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
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
