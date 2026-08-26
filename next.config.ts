import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 过渡期：已迁移路由由 Next 自动接管，未迁移的反代到 Express
  async rewrites() {
    const legacyApi = process.env.NEXT_LEGACY_API || "http://127.0.0.1:3039";
    return {
      afterFiles: [
        // afterFiles：文件系统路由优先，已迁移的 Route Handler 自动压过代理
        // 无需"逐域移除"——迁移完一个域 = Next 自动接管该域
        { source: "/api/:path*", destination: `${legacyApi}/api/:path*` },
      ],
    };
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  serverExternalPackages: ["mysql2", "nodejieba", "bcrypt"],
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
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' data:; frame-src 'self' https://open.alipay.com https://wx.tenpay.com",
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
