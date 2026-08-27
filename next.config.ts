import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 使用 Turbopack 作为打包工具（Next.js 16 默认，性能更优）
  // Turbopack 原生支持 Node.js builtins，无需 webpack 的 fallback/alias 配置
  turbopack: {},
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
  },
  // 安全头：完整复制现有 helmet 指令集（含 CSP report-only）
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
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' data:; frame-src 'self' https://open.alipay.com https://wx.tenpay.com",
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
