import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：管理端入口的受控存在（2026-10-15 修订版）。
 * @see ARCHITECTURE.md 红线 #5
 *
 * 历史：本门禁曾一刀切禁止一切管理端入口（requireAdmin 机制已于提交 18d0d4fe 移除，
 * 运营操作全部外置）。2026-10-15 用户拍板「公告打标 / 公告管理」运维功能落回本项目，
 * 红线据此收窄为**受控存在**而非解禁：
 *
 * 规则：
 *   A) src/app/api/open/v1/keys/ 下仍然不得存在任何文件（开放数据密钥管理永不回 project）；
 *   B) src/app/api/admin/** 下允许有路由，但**每个 route.ts 必须调用 requireAdminOrThrow**
 *      （ADMIN_EMAILS 白名单门禁，fail-closed）——漏挂守卫的管理接口一律拦截，
 *      杜绝当年 requireAdmin 被删的根因（无守卫裸接口）以新形态回流；
 *   C) src/**\/*.{ts,tsx,js,jsx} 中不得出现 /api/open/v1/keys 路径字面量
 *      （/api/admin/** 字面量自本修订起合法：admin 目录本身受 B 守卫，前端 client 调用需要它）。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 */
const ADMIN_DIR = path.join("src", "app", "api", "admin");
const FORBIDDEN_DIRS = [path.join("src", "app", "api", "open", "v1", "keys")];
const SCAN_ROOT = "src";
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirs = new Set(["node_modules", "dist", ".git", ".next"]);
// 只禁 keys 的路径字面量；/api/admin/** 已是受控合法面
const FORBIDDEN_PATH_LITERAL = /["'`]\/api\/open\/v1\/keys\b/;
/** 每个管理路由必须引用守卫之一：requireAdminOrThrow（白名单放行）或 isAdminUserId
 *  （仅「我是否有权限」探测口用，同样要求登录）。两者都不沾 = 18d0d4fe 要删的那类裸接口。 */
const GUARD_CALLS = ["requireAdminOrThrow", "isAdminUserId"];

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

// A) 开放数据密钥管理：仍然全禁
for (const dir of FORBIDDEN_DIRS) {
  for (const f of collectFiles(dir)) {
    violations.push(`禁止的管理路由文件（永不回 project）：${f}`);
  }
}

// B) admin 路由逐个验守卫
for (const f of collectFiles(ADMIN_DIR)) {
  if (!f.endsWith(".ts")) continue;
  const text = fs.readFileSync(f, "utf8");
  if (!GUARD_CALLS.some((g) => text.includes(g))) {
    violations.push(`管理路由未挂守卫（需 requireAdminOrThrow 或 isAdminUserId，ADMIN_EMAILS 门禁缺失）：${f}`);
  }
}

// C) 禁字面量
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
    if (FORBIDDEN_PATH_LITERAL.test(line)) violations.push(`${target}:${i + 1}: ${line.trim()}`);
  });
}
walk(SCAN_ROOT);

if (violations.length) {
  console.error("✖ 违反架构红线 #5（管理端入口受控存在，详见 ARCHITECTURE.md）：");
  violations.forEach((v) => console.error(`  - ${v}`));
  console.error("  admin 路由必须引用守卫（requireAdminOrThrow / isAdminUserId，ADMIN_EMAILS fail-closed）；/api/open/v1/keys 仍全面禁止。");
  process.exit(1);
}
