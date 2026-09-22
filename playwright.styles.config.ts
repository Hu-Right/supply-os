import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// 使用已构建的真实页面和资源，API 由只读样例隔离，不运行数据库启动任务。
// BASE_URL 可显式指向待验收环境；此时不自动启动或复用任何本地服务。
const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
export default defineConfig(config, {
  testMatch: /mobile-rtl-style-smoke\.spec\.ts/,
  workers: process.env.CI ? 1 : 4,
  projects: config.projects?.filter((project) => project.name?.startsWith("mobile-")),
  use: { ...config.use, baseURL },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "node scripts/serve-style-smoke.mjs",
        url: `${baseURL}/`,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
