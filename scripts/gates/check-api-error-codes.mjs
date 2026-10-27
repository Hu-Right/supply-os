import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：API 错误码 SSOT 与「码 → i18n」映射一致性（全域治本，2026-10-22）。
 * @see ARCHITECTURE.md 约定「错误 envelope {code,message}」「业务码集中于 shared/constants/api」
 *
 * 背景：error-map.ts 的 CODE_MAP 以「码号」为全站唯一长键取 i18n；一旦两条不同语义
 *   复用同一码号（历史手写裸数字撞了他域 EC_ 常量值），前端就会把 A 语义的错
 *   弹成 B 语义的文案（实测：解绑手机→「课程不存在」、注册密码为空→「请先登录」）。本门禁三重拦截，防复发：
 *   Rule A 码唯一性：shared/constants/api.ts 不得出现同值多常量。
 *   Rule B 禁裸数字（全局）：route.ts 里 routeError(<status>, <字面数字>) 及
 *            parseJson 的 codeByPath 里等于已知 EC 值的字面数字，一律视为违规。
 *   Rule C 登记全覆盖（全域）：所有路由 routeError/codeByPath 引用的 EC_ 常量必须已登记进
 *            error-map CODE_MAP（通用参数码 EC_INVALID_PARAMS/EC_INVALID_REQUEST 例外——
 *            刻意不登记，让后端 message 直出）。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_ERRCODE_SCAN_ROOT=<path>  把扫描根换到 <path>（自测 fixture 用；默认仓库根）
 */

// 刻意不登记进 CODE_MAP 的通用参数码（保留后端 message 直出的具体细节）。
const GENERIC_UNREGISTERED = new Set(["EC_INVALID_PARAMS", "EC_INVALID_REQUEST"]);

const repoRoot = process.env.API_ERRCODE_SCAN_ROOT || process.cwd();
const constantsFile = path.join(repoRoot, "src", "shared", "constants", "api.ts");
const errorMapFile = path.join(repoRoot, "src", "core", "http", "error-map.ts");
const apiDir = path.join(repoRoot, "src", "app", "api");
const srcDir = path.join(repoRoot, "src");

function exists(p) { return fs.existsSync(p); }
function read(p) { return exists(p) ? fs.readFileSync(p, "utf8") : ""; }

// 递归收集 route.ts
function collectRouteFiles(dir, out = []) {
  if (!exists(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) collectRouteFiles(full, out);
    else if (item === "route.ts") out.push(full);
  }
  return out;
}
// 递归收集全部待扫 .ts（route.ts + service/middleware 里的 new RouteError）；排除测试
function collectScanFiles(dir, out = []) {
  if (!exists(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (item === "__tests__") continue;
      collectScanFiles(full, out);
    } else if (item.endsWith(".ts") && !item.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}
const relPath = (p) => path.relative(repoRoot, p).split(path.sep).join("/");

// 找与 openIdx 处 '(' 配平的 ')'（跳过字符串）
function matchParen(text, openIdx) {
  let depth = 0, inStr = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const problems = [];

// ── Rule A：错误码 SSOT 唯一性 ──
const ecValueToNames = new Map(); // value → [names]
const ecNameSet = new Set();
{
  const src = read(constantsFile);
  const re = /export\s+const\s+(EC_[A-Z0-9_]+)\s*=\s*(\d+)\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], val = Number(m[2]);
    ecNameSet.add(name);
    if (!ecValueToNames.has(val)) ecValueToNames.set(val, []);
    ecValueToNames.get(val).push(name);
  }
  if (ecNameSet.size === 0) {
    problems.push(`[UNIQUE] 未能从 constants/api.ts 解析出任何 EC_ 常量（扫描根错误？）：${relPath(constantsFile)}`);
  }
  for (const [val, names] of ecValueToNames) {
    if (names.length > 1) problems.push(`[UNIQUE] 错误码 ${val} 被多个常量占用：${names.join(", ")}`);
  }
}

// ── error-map 已登记键名集合（供 Rule C）──
const registeredNames = new Set();
{
  const src = read(errorMapFile);
  const re = /\[(EC_[A-Z0-9_]+)\]\s*:/g;
  let m;
  while ((m = re.exec(src))) registeredNames.add(m[1]);
}

// ── Rule B：禁裸数字 routeError/new RouteError / codeByPath（全局）；Rule C：全域引用码须登记 ──
const NUMERIC_RE = /(?:\brouteError|new\s+RouteError)\s*\(\s*\d+\s*,\s*\d/;
let scanned = 0;
for (const file of collectScanFiles(srcDir)) {
  scanned++;
  const rel = relPath(file);
  const src = read(file);

  // Rule B-1：routeError / new RouteError(<status>, <裸数字码>)
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (NUMERIC_RE.test(line)) {
      problems.push(`[BARE] ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    }
  });

  // Rule B-2：parseJson 的 codeByPath 里等于已知 EC 值的字面数字（应改用 EC_ 常量）
  const pjRe = /\bparseJson\s*\(/g;
  let pm;
  while ((pm = pjRe.exec(src))) {
    const open = pjRe.lastIndex - 1;
    const close = matchParen(src, open);
    if (close < 0) continue;
    const args = src.slice(open + 1, close);
    for (const bm of args.matchAll(/:\s*(\d{4,})/g)) {
      if (ecValueToNames.has(Number(bm[1]))) {
        const ln = src.slice(0, open + bm.index).split("\n").length;
        problems.push(`[BARE] ${rel}:${ln}: codeByPath 裸码 ${bm[1]}（应引用 EC_ 常量）`);
      }
    }
  }

  // Rule C：全域引用的 EC_ 码（routeError/new RouteError 第二参 + codeByPath 值）须登记
  const codeRefs = new Set();
  const callRe = /(?:\brouteError|new\s+RouteError)\s*\(/g;
  let m;
  while ((m = callRe.exec(src))) {
    const open = callRe.lastIndex - 1;
    const close = matchParen(src, open);
    if (close < 0) continue;
    const inner = src.slice(open + 1, close);
    const codeExpr = inner.split(",")[1] ?? "";
    for (const x of codeExpr.matchAll(/\bEC_[A-Z0-9_]+\b/g)) codeRefs.add(x[0]);
  }
  const cbRe = /\bparseJson\s*\([^)]*\{([^}]*)\}/g;
  let cb;
  while ((cb = cbRe.exec(src))) {
    for (const x of cb[1].matchAll(/\bEC_[A-Z0-9_]+\b/g)) codeRefs.add(x[0]);
  }
  for (const n of codeRefs) {
    if (!GENERIC_UNREGISTERED.has(n) && !registeredNames.has(n)) {
      problems.push(`[UNREGISTERED] ${rel}: 码 ${n} 未登记进 error-map CODE_MAP`);
    }
  }
}

if (problems.length) {
  console.error(`✖ [API-ERR-CODES] 错误码红线违规 ${problems.length} 处：`);
  for (const p of problems.slice(0, 40)) console.error(`  · ${p}`);
  if (problems.length > 40) console.error(`  · …另有 ${problems.length - 40} 处`);
  console.error("  准则：错误码须集中于 shared/constants/api（唯一值）、以 EC_ 常量引用、路由引用码须登记进 error-map。");
  process.exit(1);
}

console.log(`✓ API 错误码红线通过（扫描 ${scanned} 个 .ts，码唯一性 OK，全域零裸数字 + 引用码全部登记）`);
