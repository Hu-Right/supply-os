import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：本项目不提供管理员功能，禁止管理端入口回流。
 * @see ARCHITECTURE.md 红线 #5（历史上 requireAdmin 机制已于提交 18d0d4fe 移除，不得复活）
 *
 * 规则：
 *   A) src/app/api/admin/ 与 src/app/api/open/v1/keys/ 下不得存在任何文件；
 *   B) src/**\/*.{ts,tsx,js,jsx} 中不得出现上述管理接口的路径字面量。
 *
 * 运营/管理操作由项目外的内部服务或受控后台维护，不在本项目提供管理接口。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 */
const ADMIN_DIRS = [
  path.join("src", "app", "api", "admin"),
  path.join("src", "app", "api", "open", "v1", "keys"),
];
const SCAN_ROOT = "src";
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirs = new Set(["node_modules", "dist", ".git", ".next"]);
// 匹配已禁止的管理路径字面量，不拦截其他开放数据 API 或附件代理。
const ADMIN_PATH_LITERAL = /["'`]\/api\/(?:admin|open\/v1\/keys)\b/;

const violations = [];

function collectFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

// A) 管理端路由目录下的任何文件
for (const dir of ADMIN_DIRS) {
  for (const f of collectFiles(dir)) {
    violations.push(`管理员专用路由文件（本项目禁止管理入口）：${f}`);
  }
}

// B) 源码中硬编码的管理接口路径字面量
function walk(target) {
  if (!fs.existsSync(target)) return;
  if (fs.statSync(target).isDirectory()) {
    if (ignoredDirs.has(path.basename(target))) return;
    for (const item of fs.readdirSync(target)) walk(path.join(target, item));
    return;
  }
  if (!extensions.has(path.extname(target))) return;
  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ADMIN_PATH_LITERAL.test(line)) violations.push(`${target}:${i + 1}: ${line.trim()}`);
  });
}
walk(SCAN_ROOT);

if (violations.length) {
  console.error("✖ 违反架构红线 #5（禁止管理员功能及管理端入口，详见 ARCHITECTURE.md）：");
  violations.forEach((v) => console.error(`  - ${v}`));
  console.error("  运营/管理操作应由项目外的内部服务或受控后台维护，不得在本项目重新暴露管理接口。");
  process.exit(1);
}
