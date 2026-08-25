/**
 * Playwright E2E 测试配置 — 前端专用模式（无需后端）
 * Frontend-only Playwright Config (no backend required)
 *
 * 使用 Vite dev server 提供前端页面，API 请求通过 route.fulfill() mock。
 * 适用于不依赖后端数据的 UI 交互测试（路由重定向、布局组件、空态展示等）。
 *
 * 运行命令：
 *   npx playwright test --config playwright.frontend.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-frontend",
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  reporter: [["html", { open: "on-failure" }]],

  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* 使用 Vite 前端 dev server，无需后端 */
  webServer: {
    command: "npx vite --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
