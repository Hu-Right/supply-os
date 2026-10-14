/**
 * next build 收尾：把 .next/static 与 public 拷进 .next/standalone。
 *
 * Next standalone 产物不自带这两类静态资源（官方要求部署时手动拷贝），
 * 漏拷 = 线上静态资源全 404——2026-10-14 事故：JS/CSS 靠浏览器旧缓存侥幸渲染，
 * public 下的字体/图标/地图 JSON 全 404。挂在 package.json build 尾部后，
 * 每次构建自动完成，部署只剩 pull + restart。
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.log("[copy-standalone-assets] 无 standalone 产物，跳过");
  process.exit(0);
}

// .next/static → .next/standalone/.next/static（JS/CSS 按内容哈希分块）
fs.rmSync(path.join(standalone, ".next", "static"), { recursive: true, force: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

// public → .next/standalone/public（字体/图标/地图 JSON/站点验证文件等）
fs.rmSync(path.join(standalone, "public"), { recursive: true, force: true });
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

console.log("[copy-standalone-assets] .next/static 与 public 已拷入 .next/standalone");
