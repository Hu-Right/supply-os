/**
 * Playwright E2E 测试配置
 * Playwright E2E Test Configuration
 *
 * 运行命令：
 *   npx playwright test          — 运行全部 E2E
 *   npx playwright test --ui     — 打开 Playwright UI 模式
 *   npx playwright test auth     — 仅运行 auth.spec.ts
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  /* 单个测试超时 */
  timeout: 30_000,
  /* 失败重试 */
  retries: process.env.CI ? 2 : 1,
  /* 并行执行 */
  fullyParallel: false,
  /* CI 下使用 list reporter，本地使用 HTML */
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["html", { open: "on-failure" }]],

  use: {
    baseURL: "http://localhost:3039",
    /* API 测试需要 Origin 头以通过 CSRF 中间件 */
    extraHTTPHeaders: {
      Origin: "http://localhost:3039",
    },
    /* 失败时截图 */
    screenshot: "only-on-failure",
    /* 重试时录制 trace */
    trace: "on-first-retry",
    /* 默认中文环境 */
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* 自动启动 dev server */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3039",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
