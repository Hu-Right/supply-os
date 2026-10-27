import fs from "node:fs";
import path from "node:path";

/**
 * API 契约门禁族的共享骨架（2026-10-27 统一，四条红线同一套扫描/报告口径）。
 *
 * 服务对象（均在 ARCHITECTURE.md「API 契约规范（三条红线）」登记）：
 *   check-api-success-shape.mjs   —— 2xx 不得返回 {code:0,message,data} 成功信封
 *   check-api-error-codes.mjs     —— 错误码 SSOT：码唯一、禁裸数字、引用码须登记
 *   check-api-field-naming.mjs    —— 响应实体字段 camelCase（分页/元数据可 snake）
 *   check-api-401-semantics.mjs   —— 401 只承载「未登录/凭据可刷新」语义
 *
 * 统一口径（为什么要共用一份）：这些门禁此前各自复制了「递归收集 / 括号配平 / 行号定位 /
 *   报告格式 / 递减白名单」五件套，任一处口径微调（例如 CRLF 行号、白名单过期检查）
 *   就会四处漂移。单点实现后，新增第 N 条 API 契约红线只需要写规则本体。
 *
 * 环境变量：API_CONTRACT_SCAN_ROOT=<path> —— 四条门禁统一用它把扫描根换成自测 fixture；
 *   未设置时用当前工作目录（仓库根）。
 */

export const SCAN_ROOT_ENV = "API_CONTRACT_SCAN_ROOT";

/** 扫描根：fixture 覆盖优先，否则仓库根 */
export function scanRoot() {
  return process.env[SCAN_ROOT_ENV] || process.cwd();
}

export function existsAt(p) {
  return fs.existsSync(p);
}

/** 读文本；文件不存在返回空串（缺文件由门禁自己的规则决定是否报错，不在此静默掩盖） */
export function readText(p) {
  return existsAt(p) ? fs.readFileSync(p, "utf8") : "";
}

/** 仓库内相对路径（posix 分隔），用于白名单键与报错定位 */
export function relOf(repoRoot, p) {
  return path.relative(repoRoot, p).split(path.sep).join("/");
}

/** 递归收集目录下的 route.ts */
export function collectRouteFiles(dir, out = []) {
  if (!existsAt(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) collectRouteFiles(full, out);
    else if (item === "route.ts") out.push(full);
  }
  return out;
}

/** 递归收集待扫 .ts（排除 __tests__ 目录与 *.test.ts） */
export function collectTsFiles(dir, out = []) {
  if (!existsAt(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (item === "__tests__") continue;
      collectTsFiles(full, out);
    } else if (item.endsWith(".ts") && !item.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** 找与 openIdx 处 '(' 配平的 ')'（跳过字符串，含转义）；不配平返回 -1 */
export function matchParen(text, openIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 字符下标 → 1-based 行号（CRLF/LF 都算一行） */
export function lineOf(text, charIdx) {
  return text.slice(0, charIdx).split(/\r?\n/).length;
}

/**
 * 遍历调用点：pattern 是形如 /(?:NextResponse|Response)\.json\s*\(/ 的调用正则（g 标志可省）。
 * 每次调用自带干净的 lastIndex，不会因提前 break 把游标泄露给下一个文件。
 * yield { open, close, args, matchIndex } —— args 为括号内实参文本，matchIndex 为调用起点。
 */
export function* callSites(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m;
  while ((m = re.exec(text))) {
    const open = re.lastIndex - 1;
    const close = matchParen(text, open);
    if (close < 0) continue;
    yield { open, close, args: text.slice(open + 1, close), matchIndex: m.index };
  }
}

/**
 * 递减白名单卫生检查：登记却已不再命中的项 = 该删的行。
 * 白名单只应随迁移变短；这一步把「删行」从人记得住变成机器提醒。
 * @param {Set<string>} allowlist  登记集合（键形如 `rel/path#key` 或纯 `rel/path`）
 * @param {Set<string>} offenders  本轮扫出的全部命中项（与 allowlist 同键形）
 * @param {string} repoRoot        用于判断登记文件是否已消失
 */
export function staleAllowlistEntries(allowlist, offenders, repoRoot) {
  const stale = [];
  for (const id of allowlist) {
    if (offenders.has(id)) continue;
    const file = id.split("#")[0];
    stale.push(existsAt(path.join(repoRoot, file))
      ? `${id}（已不再命中，请从白名单删除该行）`
      : `${id}（文件已不存在，请从白名单删除该行）`);
  }
  return stale;
}

/** 统一打印「递减白名单待收敛」提示（不影响退出码） */
export function printStale(stale, tag) {
  if (!stale.length) return;
  console.warn(`⚠ [${tag}] 递减白名单待收敛 ${stale.length} 项（不影响通过，请随迁移删除对应行）：`);
  for (const s of stale) console.warn(`  · ${s}`);
}

/**
 * 统一报告与退出：有问题 → ✖ [TAG] {title}违规 N 处：逐条列出（超出 shown 折叠）+ exit 1；
 * 无问题 → 打印白名单卫生提示 + okLine。
 * @param {object} o
 * @param {string} o.tag        门禁标识（与既有报错前缀保持一致：API-ERR-CODES / SNAKE-KEY / 401 …）
 * @param {string[]} o.problems 已格式化的违规行（自带 `rel:line:` 定位）
 * @param {string} [o.title]    违规类别描述，拼在「✖ [TAG]」之后
 * @param {string} [o.okLine]   通过时打印的一行
 * @param {string} [o.guidance] 失败时的准则提示
 * @param {number} [o.shown]    最多展示条数
 * @param {string[]} [o.stale]  白名单待收敛项
 */
export function reportAndExit({ tag, problems, title = "", okLine, guidance, shown = 40, stale = [] }) {
  if (problems.length) {
    console.error(`✖ [${tag}] ${title}违规 ${problems.length} 处：`);
    for (const p of problems.slice(0, shown)) console.error(`  · ${p}`);
    if (problems.length > shown) console.error(`  · …另有 ${problems.length - shown} 处`);
    if (guidance) console.error(`  ${guidance}`);
    process.exit(1);
  }
  printStale(stale, tag);
  if (okLine) console.log(okLine);
}
