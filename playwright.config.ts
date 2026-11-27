import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 测试配置
 *
 * 运行方式：
 *   npx playwright test                              # 全量运行
 *   npx playwright test --project=chromium            # 单浏览器
 *   npx playwright test --ui                          # 交互式 UI
 *   npm run test:e2e                                  # 通过 npm script
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    // 固定浏览器 locale：i18n 语言检测依赖 Accept-Language，
    // 不固定时 Firefox/WebKit 默认 locale 与 Chromium 不一致导致页面渲染语言漂移
    locale: "zh-CN",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // 移动端专用冒烟用例（RTL/窄屏溢出）不在桌面 project 重复跑
      testIgnore: /mobile-rtl-style-smoke/,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: /mobile-rtl-style-smoke|api-coverage|procurement-publish-chain/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: /mobile-rtl-style-smoke|api-coverage|procurement-publish-chain/,
    },
    // 移动端回归
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      // API 覆盖只在 chromium 跑一次（与浏览器无关，避免 5 个 project 重复打接口）
      testIgnore: /api-coverage|procurement-publish-chain/,
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      testIgnore: /api-coverage|procurement-publish-chain/,
    },
  ],

  webServer: process.env.CI
    ? undefined // CI 中由 ci.yml 的 e2e job 启动（生产构建产物 + MySQL 结构基线 + 迁移账本终态）
    : {
        command: "npm run dev",
        url: process.env.BASE_URL || "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
