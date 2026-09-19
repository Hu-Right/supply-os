import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：禁止管理员专用路由 /api/admin/*
 * @see ARCHITECTURE.md 红线 #5（历史上 requireAdmin 机制已于提交 18d0d4fe 移除，不得复活）
 *
 * 规则：
 *   A) src/app/api/admin/ 下不得存在任何文件（Next.js 会将其注册为路由端点）；
 *   B) src/**\/*.{ts,tsx,js,jsx} 中不得出现硬编码的 "/api/admin" 路径字面量。
 *
 * 运营/管理操作应走「统一业务 API + 服务端鉴权中间件」，或由内部服务/受控后台直接维护数据。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 */
const ADMIN_DIR = path.join("src", "app", "api", "admin");
const SCAN_ROOT = "src";
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirs = new Set(["node_modules", "dist", ".git", ".next"]);
// 仅匹配字符串字面量中的 /api/admin 路径（前引号 + 路径 + 词边界），避免误伤注释里的散文描述
const ADMIN_PATH_LITERAL = /["'`]\/api\/admin\b/;

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
for (const f of collectFiles(ADMIN_DIR)) {
  violations.push(`管理员专用路由文件（禁止 /api/admin/*）：${f}`);
}

// B) 源码中硬编码的 /api/admin 路径字面量
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
  console.error("✖ 违反架构红线 #5（禁止管理员专用路由 /api/admin/*，详见 ARCHITECTURE.md）：");
  violations.forEach((v) => console.error(`  - ${v}`));
  console.error("  运营/管理操作请走统一业务 API + 服务端鉴权中间件，或由内部服务/受控后台直接维护数据。");
  process.exit(1);
}
