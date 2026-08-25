/**
 * 性能预算检查脚本
 * Performance budget check
 *
 * 使用 Playwright 采集页面性能指标，与预设阈值对比。
 * 超标时以 exit code 1 退出（CI 自动失败）。
 *
 * 环境变量 (可选，覆盖默认阈值):
 *   PERF_TTFB_BUDGET   (default: 500ms)
 *   PERF_FCP_BUDGET    (default: 1800ms)
 *   PERF_LCP_BUDGET    (default: 4000ms)
 *   PERF_DOM_BUDGET    (default: 3500ms)
 *   PERF_BASE_URL      (default: http://localhost:3039)
 */
import { chromium } from "@playwright/test";

interface PerfMetrics {
  ttfb: number;
  fcp: number;
  lcp: number;
  domInteractive: number;
}

const BUDGETS = {
  ttfb: Number(process.env.PERF_TTFB_BUDGET || 500),
  fcp: Number(process.env.PERF_FCP_BUDGET || 1800),
  lcp: Number(process.env.PERF_LCP_BUDGET || 4000),
  domInteractive: Number(process.env.PERF_DOM_BUDGET || 3500),
};

const BASE_URL = process.env.PERF_BASE_URL || "http://localhost:3039";

/** 需要检查的关键页面 */
const PAGES = [
  { name: "首页", path: "/" },
  { name: "公告列表", path: "/procurement/notices" },
  { name: "供应商目录", path: "/supplier/list" },
];

async function collectMetrics(page: import("@playwright/test").Page, url: string): Promise<PerfMetrics> {
  await page.goto(url, { waitUntil: "networkidle" });

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");

    return {
      ttfb: nav.responseStart - nav.requestStart,
      fcp: paint?.startTime ?? 0,
      domInteractive: nav.domInteractive,
    };
  });

  // LCP 需要通过 PerformanceObserver 异步获取
  const lcp = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let lcpValue = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1].startTime;
        }
      });
      try {
        observer.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        // buffered 模式不支持时回退
      }
      setTimeout(() => {
        observer.disconnect();
        resolve(lcpValue);
      }, 500);
    });
  });

  return {
    ttfb: Math.round(timing.ttfb),
    fcp: Math.round(timing.fcp),
    lcp: Math.round(lcp),
    domInteractive: Math.round(timing.domInteractive),
  };
}

function formatMs(ms: number): string {
  return `${ms}ms`;
}

function checkBudget(name: string, metric: string, value: number, budget: number): boolean {
  const pass = value <= budget;
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${name} ${metric}: ${formatMs(value)} (预算: ${formatMs(budget)})`);
  return pass;
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║       性能预算检查                    ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║ 目标: ${BASE_URL.padEnd(31)}║`);
  console.log(`║ TTFB 预算: ${formatMs(BUDGETS.ttfb).padEnd(24)}║`);
  console.log(`║ FCP 预算:  ${formatMs(BUDGETS.fcp).padEnd(24)}║`);
  console.log(`║ LCP 预算:  ${formatMs(BUDGETS.lcp).padEnd(24)}║`);
  console.log(`║ DOM 预算:  ${formatMs(BUDGETS.domInteractive).padEnd(24)}║`);
  console.log("╚══════════════════════════════════════╝\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let allPassed = true;

  try {
    for (const pg of PAGES) {
      const page = await context.newPage();
      const url = `${BASE_URL}${pg.path}`;
      console.log(`▶ ${pg.name} (${url})`);

      try {
        const metrics = await collectMetrics(page, url);

        if (!checkBudget(pg.name, "TTFB", metrics.ttfb, BUDGETS.ttfb)) allPassed = false;
        if (!checkBudget(pg.name, "FCP", metrics.fcp, BUDGETS.fcp)) allPassed = false;
        if (!checkBudget(pg.name, "LCP", metrics.lcp, BUDGETS.lcp)) allPassed = false;
        if (!checkBudget(pg.name, "DOM Interactive", metrics.domInteractive, BUDGETS.domInteractive)) allPassed = false;
      } catch (err) {
        console.error(`  ✗ 采集失败: ${(err as Error).message}`);
        allPassed = false;
      }

      console.log();
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (!allPassed) {
    console.error("✗ 性能预算检查未通过，请优化页面性能或调整预算阈值");
    process.exit(1);
  }

  console.log("✓ 所有页面性能指标在预算范围内");
}

main().catch((err) => {
  console.error("✗ 性能预算检查失败:", err);
  process.exit(1);
});
