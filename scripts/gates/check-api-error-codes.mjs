import path from "node:path";
import {
  scanRoot,
  relOf,
  readText,
  collectTsFiles,
  callSites,
  lineOf,
  reportAndExit,
} from "./lib/api-contract.mjs";

/**
 * 架构红线守卫：API 错误码 SSOT 与「码 → i18n」映射一致性（全域治本，2026-10-22）。
 * @see ARCHITECTURE.md「API 契约规范（三条红线）」——错误码集中于 shared/constants/api，以 EC_ 常量引用
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
 * 扫描/报告口径走共享骨架 `lib/api-contract.mjs`（四条 API 契约门禁同一口径）。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_CONTRACT_SCAN_ROOT=<path>  把扫描根换到 <path>（自测 fixture 用；默认仓库根）
 */

// 刻意不登记进 CODE_MAP 的通用参数码（保留后端 message 直出的具体细节）。
const GENERIC_UNREGISTERED = new Set(["EC_INVALID_PARAMS", "EC_INVALID_REQUEST"]);

const repoRoot = scanRoot();
const constantsFile = path.join(repoRoot, "src", "shared", "constants", "api.ts");
const errorMapFile = path.join(repoRoot, "src", "core", "http", "error-map.ts");
const srcDir = path.join(repoRoot, "src");

const problems = [];

// ── Rule A：错误码 SSOT 唯一性 ──
const ecValueToNames = new Map(); // value → [names]
const ecNameSet = new Set();
{
  const src = readText(constantsFile);
  const re = /export\s+const\s+(EC_[A-Z0-9_]+)\s*=\s*(\d+)\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], val = Number(m[2]);
    ecNameSet.add(name);
    if (!ecValueToNames.has(val)) ecValueToNames.set(val, []);
    ecValueToNames.get(val).push(name);
  }
  if (ecNameSet.size === 0) {
    problems.push(`[UNIQUE] 未能从 constants/api.ts 解析出任何 EC_ 常量（扫描根错误？）：${relOf(repoRoot, constantsFile)}`);
  }
  for (const [val, names] of ecValueToNames) {
    if (names.length > 1) problems.push(`[UNIQUE] 错误码 ${val} 被多个常量占用：${names.join(", ")}`);
  }
}

// ── error-map 已登记键名集合（供 Rule C）──
const registeredNames = new Set();
{
  const src = readText(errorMapFile);
  const re = /\[(EC_[A-Z0-9_]+)\]\s*:/g;
  let m;
  while ((m = re.exec(src))) registeredNames.add(m[1]);
}

// ── Rule B：禁裸数字 routeError/new RouteError / codeByPath（全局）；Rule C：全域引用码须登记 ──
const NUMERIC_RE = /(?:\brouteError|new\s+RouteError)\s*\(\s*\d+\s*,\s*\d/;
const ERR_CALL = /(?:\brouteError|new\s+RouteError)\s*\(/;
const PARSE_JSON_CALL = /\bparseJson\s*\(/;
let scanned = 0;

for (const file of collectTsFiles(srcDir)) {
  scanned++;
  const rel = relOf(repoRoot, file);
  const src = readText(file);

  // Rule B-1：routeError / new RouteError(<status>, <裸数字码>)
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (NUMERIC_RE.test(line)) {
      problems.push(`[BARE] ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    }
  });

  // Rule B-2：parseJson 的 codeByPath 里等于已知 EC 值的字面数字（应改用 EC_ 常量）
  for (const { open, args } of callSites(src, PARSE_JSON_CALL)) {
    for (const bm of args.matchAll(/:\s*(\d{4,})/g)) {
      if (ecValueToNames.has(Number(bm[1]))) {
        problems.push(`[BARE] ${rel}:${lineOf(src, open + bm.index)}: codeByPath 裸码 ${bm[1]}（应引用 EC_ 常量）`);
      }
    }
  }

  // Rule B-3：响应体 `{ code: <裸数字> }` 字面量（Response/NextResponse.json 直出的错误码，绕过 routeError 的盲区）
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    if (/\bcode:\s*\d{4,6}\b/.test(line)) {
      problems.push(`[BARE] ${rel}:${i + 1}: 响应体 code 裸数字（应引用 EC_ 常量）：${t.slice(0, 80)}`);
    }
  });

  // Rule C：全域引用的 EC_ 码（routeError/new RouteError 第二参 + codeByPath 值）须登记
  const codeRefs = new Set();
  for (const { args } of callSites(src, ERR_CALL)) {
    const codeExpr = args.split(",")[1] ?? "";
    for (const x of codeExpr.matchAll(/\bEC_[A-Z0-9_]+\b/g)) codeRefs.add(x[0]);
  }
  for (const cb of src.matchAll(/\bparseJson\s*\([^)]*\{([^}]*)\}/g)) {
    for (const x of cb[1].matchAll(/\bEC_[A-Z0-9_]+\b/g)) codeRefs.add(x[0]);
  }
  for (const n of codeRefs) {
    if (!GENERIC_UNREGISTERED.has(n) && !registeredNames.has(n)) {
      problems.push(`[UNREGISTERED] ${rel}: 码 ${n} 未登记进 error-map CODE_MAP`);
    }
  }
}

reportAndExit({
  tag: "API-ERR-CODES",
  title: "错误码红线",
  problems,
  guidance: "准则：错误码须集中于 shared/constants/api（唯一值）、以 EC_ 常量引用、路由引用码须登记进 error-map。",
  okLine: `✓ API 错误码红线通过（扫描 ${scanned} 个 .ts，码唯一性 OK，全域零裸数字 + 引用码全部登记）`,
});
