import fs from "node:fs";
import path from "node:path";

// 扫描范围：前端 src/ + 后端 server/ + server.ts 入口 + scripts/
// （原脚本仅 src + server.ts，后端代码与脚本自身漏检）
const roots = ["src", "server", "server.ts", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".html", ".css"]);
// 乱码特征：
// 1. U+FFFD 替换字符（解码失败的直接产物）
// 2. GBK 字节被按 UTF-8 误读产生的高频罕见字（已剔除“瑙/昏”等合法汉字，
//    避免“瑙鲁”（Nauru 国名）、“黄昏”等正常文本误报）
// 3. “楼”后紧跟数字（“X楼”类编码错乱产物）
const mojibakePatterns = [
  /\uFFFD/,
  /锛|鍏|鏂|鏀|杩|閲|绾|缈|铸|闆/,
  /楼(?=\d)/,
];

// 本脚本自身包含乱码特征字符（模式定义），排除自匹配
const SELF = path.resolve("scripts/check-mojibake.mjs");

const ignoredDirs = new Set(["node_modules", "dist", ".git"]);
const failures = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    if (ignoredDirs.has(path.basename(target))) return;
    for (const item of fs.readdirSync(target)) walk(path.join(target, item));
    return;
  }

  if (!extensions.has(path.extname(target))) return;
  if (path.resolve(target) === SELF) return; // 跳过本脚本自身
  const content = fs.readFileSync(target, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (mojibakePatterns.some((pattern) => pattern.test(line))) {
      failures.push(`${target}:${index + 1}: ${line.trim()}`);
    }
  });
}

roots.forEach(walk);

if (failures.length) {
  console.error("Possible mojibake text found. Keep source files UTF-8 and fix these lines:");
  failures.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}
