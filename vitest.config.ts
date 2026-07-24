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
      include: ["src/**/*.{ts,tsx}"],
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
      ],
    },
  },
});
