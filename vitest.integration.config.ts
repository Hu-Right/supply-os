import { defineConfig } from "vitest/config";
import path from "path";

/**
 * 集成测试专用 Vitest 配置
 * 运行 tests/integration/ 下的测试文件
 * Mock DB Pool，不连接真实数据库
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**"],
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage/integration",
      include: [
        "src/lib/middleware/**/*.ts",
        // 集成测试覆盖的 API Route Handlers
        "src/app/api/system/**/*.ts",
        "src/app/api/membership/**/*.ts",
        "src/app/api/catalog/**/*.ts",
        "src/app/api/auth/login/**/*.ts",
      ],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/db/**",
        "src/lib/lifecycle/**",
        "server.ts",
      ],
    },
  },
});
