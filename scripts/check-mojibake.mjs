import fs from "node:fs";
import path from "node:path";

const roots = ["src", "server.ts"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".html", ".css"]);
const mojibakePatterns = [
  /�/,
  /锛|鍏|鏂|鏀|瑙|杩|閲|绾|缈|昏|瘧|铸|闆/,
  /楼(?=\d)/,
];

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
