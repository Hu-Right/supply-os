import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：手写 DDL 的 CREATE TABLE 必须表级显式统一到 utf8mb4 / utf8mb4_0900_ai_ci
 * @see docs/数据库设计/数据库字符集与排序规则统一规范.md（§1 铁律、§4 步骤5「加门禁防回潮」）
 *
 * 背景：审计发现大量建表漏写 COLLATE → 继承错误的库默认，与主流 0900_ai_ci 表
 *      JOIN 时报 Illegal mix of collations；2026-10-14 云库已治理统一到 0900_ai_ci。
 *      此门禁防止新写的迁移/建表脚本再次漏写或写错，把红线固化成 CI 拦截。
 *
 * 规则：
 *   DC1) 每个 CREATE TABLE（非 `... LIKE` 复制）的“表选项子句”（列定义右括号之后）：
 *        写了 `CHARSET=utf8mb4` 却漏 `COLLATE=utf8mb4_0900_ai_ci`、或表级 COLLATE 非 0900_ai_ci → fail；
 *        表名在 ALLOWLIST 的有意例外跳过。（完全不写 charset 的，视为依赖已对齐的库默认，不报，避免误伤）
 *   DC2) 表选项里出现非 utf8mb4 字符集（旧 3 字节 utf8mb3 等）→ fail。
 *   DC3) 表选项必须显式 `ENGINE=InnoDB`；写成 MyISAM/MEMORY 等非 InnoDB、或漏写 ENGINE → fail。
 *        （InnoDB 是规范 §1 唯一允许引擎：事务/行锁/崩溃恢复/外键；MyISAM 等无这些能力。）
 *   注：列级 `COLLATE utf8mb4_bin`（精确匹配列）在括号内、不受本门禁约束（只校表级默认）。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 * 扫描根可用环境变量 DDL_COLLATION_SCAN_ROOT 覆盖（供夹具自测使用）。
 */
const ROOT = process.env.DDL_COLLATION_SCAN_ROOT || process.cwd();
const SCAN_DIRS = ["src", "scripts", "db/schema"].map((d) => path.join(ROOT, d));
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]);
const STD = "utf8mb4_0900_ai_ci";

/** 有意例外：表级需要精确字节匹配（utf8mb4_bin）的表 —— 加入必须在此注明原因 */
const ALLOWLIST = new Set([
  // 例：'some_exact_match_table'  // 原因：license key 精确比对
]);

function walk(target, out) {
  if (!fs.existsSync(target)) return;
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(path.join(target, entry.name), out);
    }
    return;
  }
  if (!EXT.has(path.extname(target))) return;
  out.push(target);
}

const files = [];
for (const dir of SCAN_DIRS) walk(dir, files);

const violations = [];
let checked = 0;

function optionsAfterBody(stmt) {
  // 找到列定义体（第一个左括号）匹配的右括号，返回其后子句；忽略单/双引号内的括号
  const open = stmt.indexOf("(");
  if (open === -1) return null;
  let depth = 0, inStr = false, strCh = "";
  for (let i = open; i < stmt.length; i++) {
    const c = stmt[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return stmt.slice(i + 1); }
  }
  return null;
}

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  // 只认“表名后紧跟左括号列清单”的真实建表定义；SHOW CREATE TABLE / CTAS(AS SELECT) / LIKE 复制
  // 以及日志/文案里出现的 “CREATE TABLE” 字样都不匹配，天然排除，避免误伤。
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_$]*)|\$\{[^}]*\})\s*\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    const name = m[1] ?? m[2] ?? "(动态名)";
    if (ALLOWLIST.has(name)) continue;
    let end = text.indexOf(";", start);
    if (end === -1) end = Math.min(text.length, start + 6000);
    const stmt = text.slice(start, end + 1);
    const line = text.slice(0, start).split(/\r?\n/).length;
    const options = optionsAfterBody(stmt);
    if (options === null) continue; // 没有列定义体（异常/动态拼接），跳过不误报
    checked++;

    const collM = options.match(/COLLATE\s*=?\s*([A-Za-z0-9_]+)/i);
    const charsetUtf8mb4 = /(?:DEFAULT\s+)?CHAR(?:SET|ACTER\s+SET)\s*=?\s*utf8mb4\b/i.test(options);
    const nonUtf8mb4 = /(?:DEFAULT\s+)?CHAR(?:SET|ACTER\s+SET)\s*=?\s*(?!utf8mb4)([A-Za-z0-9_]+)/i.exec(options);

    if (nonUtf8mb4) {
      violations.push(`${rel}:${line} [DC2] 表 \`${name}\` 表级字符集=${nonUtf8mb4[1]}（禁用 utf8mb3/非 utf8mb4）`);
    }
    if (charsetUtf8mb4 && !collM) {
      violations.push(`${rel}:${line} [DC1] 表 \`${name}\` 写了 CHARSET=utf8mb4 却漏 COLLATE=${STD}`);
    } else if (collM && collM[1].toLowerCase() !== STD) {
      violations.push(`${rel}:${line} [DC1] 表 \`${name}\` 表级 COLLATE=${collM[1]}，应为 ${STD}（确需例外请在 ALLOWLIST 注明原因）`);
    }

    const engM = options.match(/ENGINE\s*=\s*([A-Za-z0-9_]+)/i);
    if (!engM) {
      violations.push(`${rel}:${line} [DC3] 表 \`${name}\` 未显式声明 ENGINE=InnoDB（禁止依赖默认/遗留引擎）`);
    } else if (engM[1].toLowerCase() !== "innodb") {
      violations.push(`${rel}:${line} [DC3] 表 \`${name}\` 引擎=${engM[1]}，必须 InnoDB（MyISAM 等无事务/行锁，禁用；确需例外请入 ALLOWLIST 并注明原因）`);
    }
  }
}

if (violations.length > 0) {
  console.error(`✗ 建表字符集/排序红线被违反（${violations.length} 处）：`);
  for (const v of violations.slice(0, 40)) console.error("  - " + v);
  if (violations.length > 40) console.error(`  … 另有 ${violations.length - 40} 处`);
  console.error("修法：CREATE TABLE 表尾显式写全 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`；精确匹配列才用列级 utf8mb4_bin。");
  process.exit(1);
}
console.log(`✓ 建表字符集/排序红线通过（扫描 ${files.length} 个文件，校验 ${checked} 张 CREATE TABLE，表级全部 ${STD}）`);
