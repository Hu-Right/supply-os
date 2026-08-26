/**
 * 静态预渲染脚本
 * 构建时为关键页面生成静态 HTML 快照，供搜索引擎爬虫使用
 *
 * 工作原理：
 * 1. 启动 Vite 开发服务器
 * 2. 使用 Puppeteer/Playwright 访问每个预渲染页面
 * 3. 等待 JS 执行完毕，获取完整渲染的 HTML
 * 4. 保存为 dist/prerender/{path}/index.html
 * 5. 服务端检测爬虫 UA 时返回对应的静态 HTML
 *
 * @module scripts/prerender
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// ── 配置 ──────────────────────────────────────────────────────────

/** 预渲染页面列表（路径 → 等待选择器） */
const PAGES_TO_PRERENDER: Array<{ path: string; waitFor?: string; timeout?: number }> = [
  { path: "/", waitFor: "#root", timeout: 10000 },
  { path: "/showroom", waitFor: "#root", timeout: 15000 },
  { path: "/procurement", waitFor: "#root", timeout: 15000 },
  { path: "/supplier", waitFor: "#root", timeout: 15000 },
  { path: "/services", waitFor: "#root", timeout: 10000 },
  { path: "/learning", waitFor: "#root", timeout: 10000 },
  { path: "/training", waitFor: "#root", timeout: 20000 },
  { path: "/procurement/qualification", waitFor: "#root", timeout: 15000 },
];

/** 预渲染输出目录 */
const PRERENDER_DIR = path.join(process.cwd(), "dist", "prerender");

/** Vite 开发服务器端口 */
const SERVER_PORT = 5174;

// ── 主函数 ──────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 开始静态预渲染...\n");

  // 1. 确保 dist 目录存在
  if (!fs.existsSync(path.join(process.cwd(), "dist"))) {
    console.error("❌ dist 目录不存在，请先运行 npm run build");
    process.exit(1);
  }

  // 2. 创建预渲染输出目录
  fs.mkdirSync(PRERENDER_DIR, { recursive: true });

  // 3. 启动 Vite 预览服务器（使用已构建的 dist）
  console.log(`📡 启动预览服务器 (port ${SERVER_PORT})...`);
  const previewProcess = spawn(
    "npx", ["vite", "preview", "--port", String(SERVER_PORT), "--host"],
    { stdio: "pipe" }
  );

  // 等待服务器启动
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    // 4. 使用 Playwright 预渲染每个页面
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    for (const pageConfig of PAGES_TO_PRERENDER) {
      const { path: pagePath, waitFor, timeout = 10000 } = pageConfig;
      const url = `http://localhost:${SERVER_PORT}${pagePath}`;

      console.log(`  📄 预渲染 ${pagePath}...`);

      const page = await browser.newPage();

      try {
        // 访问页面
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout,
        });

        // 等待关键元素渲染完成
        if (waitFor) {
          await page.waitForSelector(waitFor, { timeout });
        }

        // 额外等待确保动态内容加载
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 获取完整 HTML
        const html = await page.content();

        // 保存预渲染 HTML
        const outputDir = path.join(
          PRERENDER_DIR,
          pagePath === "/" ? "index" : pagePath.replace(/^\//, "")
        );
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf-8");

        console.log(`     ✅ 成功 (${html.length} bytes)`);
      } catch (error) {
        console.error(`     ❌ 失败: ${(error as Error).message}`);
      } finally {
        await page.close();
      }
    }

    await browser.close();
    console.log("\n✨ 预渲染完成！\n");
  } catch (error) {
    console.error("\n❌ 预渲染失败:", (error as Error).message);
    console.log("\n💡 提示：确保已安装 playwright: npx playwright install chromium");
  } finally {
    // 5. 关闭预览服务器
    previewProcess.kill();
    console.log("🛑 预览服务器已关闭");
  }
}

main().catch((error) => {
  console.error("预渲染脚本执行失败:", error);
  process.exit(1);
});
