import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    pool: "forks",
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",        // barrel 导出（无逻辑）
        "src/types/**",           // 纯类型定义
        "src/data/**",            // 纯静态数据
        "src/payment/**",         // 后端支付提供者（后端冻结）
        "src/main.tsx",           // 入口挂载点
        // 各 feature 内的纯类型/纯数据文件
        "src/core/auth/types.ts",
        "src/core/http/types.ts",
        "src/core/i18n/types.ts",
        "src/features/auth/types.ts",
        "src/features/crm/types.ts",
        "src/features/payment/types.ts",
        "src/features/procurement/types.ts",
        "src/features/learning/data.ts",
        "src/features/membership/data.ts",
        "src/features/services/types.ts",
        // API 层（MSW 测试，覆盖率统计不准确）
        "src/features/payment/api.ts",
        "src/features/showroom/api.ts",
        "src/features/crm/api.ts",
        "src/features/procurement/api.ts",
        "src/features/training/api.ts",
        // React 19 use() API 难以单元测试
        "src/core/http/useFetch.ts",
        // 服务端排除项
        "server/**/*.test.ts",
        "server/db/schema.ts",    // 数据库 schema 定义
        "server/db/migrations/**", // 数据库迁移脚本
        "server/db/pool.ts",      // 连接池创建（依赖运行时 MySQL）
        "server/db/backfills.ts", // 数据回填（依赖 DB）
        "server/db/seeds.ts",     // 种子数据（依赖 DB）
        "server/db/seeds/**",     // 种子数据目录
        "server/data/agency-i18n/**", // i18n 静态数据
        "server/lifecycle/**",    // 启动生命周期（依赖完整运行时）
        "server/config/env.ts",   // 环境变量配置
        "server/bootstrap.ts",    // 服务启动入口（依赖完整运行时）
        "server/context.ts",      // 纯类型定义
        "server.ts",              // 进程入口
        "server/app.ts",          // Express 应用工厂（依赖完整 ctx）
        // 前端入口/路由（纯 JSX 声明）
        "src/App.tsx",
        "src/routes.tsx",
        "src/vite-env.d.ts",
        // 解析失败的源文件（语法不兼容 v8 coverage parser）
        "server/payment/qr.ts",
        "src/shared/forms/ConsultForm.tsx",
        "src/features/crm/hooks/useCrmData.ts",
      ],
    },
  },
});
