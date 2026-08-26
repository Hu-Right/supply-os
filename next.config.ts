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
    "formstream",
    "destroy",
    "nodemailer",
    "jsonwebtoken",
    "qrcode",
  ],
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
  webpack: (config, { isServer, nextRuntime }) => {
    const existing = Array.isArray(config.externals) ? config.externals : [];
    // Edge 运行时（middleware 编译）会连带打包 instrumentation 的依赖图，
    // 其中 crypto/fs/stream 等 Node builtin 在 edge 不可用。
    // instrumentation 内的 NEXT_RUNTIME 守卫保证 edge 永不执行这些代码，
    // 因此将 Node builtin 标记为 external，让 edge bundle 编译通过即可。
    if (nextRuntime === "edge") {
      const nodeBuiltins = [
        "crypto", "fs", "path", "os", "stream", "util", "zlib",
        "http", "https", "net", "tls", "events", "url", "buffer", "querystring",
      ];
      config.externals = [...existing, ...nodeBuiltins];
      return config;
    }
    if (isServer) {
      // alipay-sdk v4 为纯 ESM Node 库，serverExternalPackages 仅对 CJS 生效。
      // 用 function-based external 拦截这些包及其传递依赖（含 node: 前缀 URI），
      // 留给运行时 Node 解析，避免 webpack 尝试打包。
      const nodeOnlyEsm = /^(@alicloud\/.*|alipay-sdk|formstream|urllib|through|pause-stream|utility|node:.*)$/;
      config.externals = [
        ...existing,
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request && nodeOnlyEsm.test(request)) {
            return callback(null, "commonjs " + request);
          }
          callback();
        },
      ];
    }
    return config;
  },
  generateBuildId: async () => {
    // CI 注入 BUILD_ID（github.sha），runtime 容器同步注入
    return process.env.BUILD_ID || null;
  },
};

export default nextConfig;
