import type { NextConfig } from "next";
import { builtinModules } from "module";

const nextConfig: NextConfig = {
  output: "standalone",
  // 过渡期：src/server/ 从 src/lib/ 复制，ESLint/TS 规则差异暂不处理
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // 过渡期：已迁移路由由 Next 自动接管，未迁移的反代到 Express
  async rewrites() {
    const legacyApi = process.env.NEXT_LEGACY_API || "http://127.0.0.1:3039";
    return {
      afterFiles: [
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
    "destroy",
    "nodemailer",
    "jsonwebtoken",
    "qrcode",
  ],
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

    // 客户端构建：剥离 node: 前缀 + 提供空 fallback
    if (!isServer && nextRuntime !== "edge") {
      config.resolve = config.resolve || {};

      // 关键：将 node:console → console, node:crypto → crypto 等
      // 这样 resolve.fallback 才能生效
      const nodeAlias: Record<string, string | false> = {};
      for (const mod of builtinModules) {
        nodeAlias[`node:${mod}`] = mod;
      }
      // 补充子模块（builtinModules 可能不包含）
      const subModules = [
        "fs/promises", "stream/web", "stream/consumers",
        "readline/promises", "dns/promises", "timers/promises",
      ];
      for (const mod of subModules) {
        nodeAlias[`node:${mod}`] = mod;
      }
      config.resolve.alias = {
        ...config.resolve.alias,
        ...nodeAlias,
      };

      // Node.js 内置模块 + 服务器端包 → 空模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        console: false, crypto: false, fs: false, "fs/promises": false, path: false,
        os: false, stream: false, util: false, zlib: false,
        http: false, https: false, net: false, tls: false,
        events: false, url: false, buffer: false, querystring: false,
        diagnostics_channel: false, async_hooks: false, child_process: false,
        dns: false, readline: false, perf_hooks: false, worker_threads: false,
        v8: false, vm: false, tty: false, cluster: false, dgram: false,
        // 服务器端包
        mysql2: false, bcrypt: false, "alipay-sdk": false,
        urllib: false, undici: false, nodemailer: false,
        meilisearch: false, nodejieba: false, sharp: false,
      };
    }

    // Edge 运行时
    if (nextRuntime === "edge") {
      const nodeBuiltins = [
        "crypto", "fs", "path", "os", "stream", "util", "zlib",
        "http", "https", "net", "tls", "events", "url", "buffer", "querystring",
        "console", "diagnostics_channel", "async_hooks", "child_process",
      ];
      config.externals = [...existing, ...nodeBuiltins];
      return config;
    }

    // 服务端构建：ESM 包 external
    if (isServer) {
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
    return process.env.BUILD_ID || null;
  },
};

export default nextConfig;
