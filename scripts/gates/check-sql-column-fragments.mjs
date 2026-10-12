import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：SQL 列清单的分隔符只能有一个出处
 * @see src/lib/utils/sql-columns.ts
 *
 * 规则：
 *   SQ1) 名为 *Select / *Cols / *Columns / *Fields 的变量，其字符串字面量不得以逗号开头或结尾。
 *        「片段自带分隔符」是这条红线的成因：相似公告把两个各带尾逗号的片段拼在 FROM 前，
 *        MySQL 1064，接口上线三周每次都是 500，而单测 mock 了 pool.query 所以全绿。
 *   SQ2) 任何含 SELECT 的字符串/模板里，不得出现「逗号紧跟 FROM」的形态（含跨行）。
 *        这正是 1064 的文本特征；列清单若由 columns() 产出，模板里就不该再出现字面量列表尾巴。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 * 扫描根可用环境变量 SQL_SHAPE_SCAN_ROOT 覆盖（供本脚本的夹具测试使用）。
 */
const ROOT = process.env.SQL_SHAPE_SCAN_ROOT || process.cwd();
const SCAN_DIRS = [path.join(ROOT, "src")];
const EXT = new Set([".ts", ".tsx"]);

/** 注释行不参与判定：文档里会引用反例原文 */
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t === "";
}

const FRAGMENT_ASSIGN = /(?:const|let)\s+\w*(?:Select|Cols|Columns|Fields)\w*\s*=\s*(.+)$/;
const STRING_LITERALS = /["'`]([^"'`\n]*)["'`]/g;
const COMMA_BEFORE_FROM = /,\s*(?:\n\s*)?FROM\s/i;
/** 纯分隔符（", "、","、"(" 等）不是列片段：join(", ") 这类写法不该被当成自带逗号 */
const SEPARATOR_ONLY = /^[^A-Za-z0-9_]+$/;

const violations = [];
const fileCache = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(path.join(target, entry.name));
    }
    return;
  }
  if (!EXT.has(path.extname(target))) return;
  fileCache.push(target);
}

for (const dir of SCAN_DIRS) walk(dir);

for (const file of fileCache) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  // SQ1：列片段自带首尾逗号
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const m = line.match(FRAGMENT_ASSIGN);
    if (!m) return;
    for (const lit of m[1].matchAll(STRING_LITERALS)) {
      const text = lit[1].trim();
      if (!text) continue;
      if (SEPARATOR_ONLY.test(text)) continue;
      if (/,$/.test(text)) {
        violations.push(`${rel}:${i + 1} [SQ1] 列片段以逗号结尾（分隔符必须由 columns() 插入）：${text}`);
      } else if (/^,/.test(text)) {
        violations.push(`${rel}:${i + 1} [SQ1] 列片段以逗号开头（分隔符必须由 columns() 插入）：${text}`);
      }
    }
  });

  // SQ2：拼好的语句里「逗号紧跟 FROM」
  const whole = lines.join("\n");
  const stmtStarts = [...whole.matchAll(/[`"'](SELECT[\s\S]*?)[`"']/gi)];
  for (const stmt of stmtStarts) {
    if (!COMMA_BEFORE_FROM.test(stmt[1])) continue;
    const upto = whole.slice(0, stmt.index).split("\n").length;
    const snippet = stmt[1].match(/[\s\S]{0,40},\s*(?:\n\s*)?FROM\s/i)?.[0] ?? "";
    violations.push(`${rel}:${upto} [SQ2] SELECT 列清单尾随逗号紧跟 FROM，MySQL 会 1064：…${snippet.replace(/\s+/g, " ").trim()}`);
  }
}

if (violations.length > 0) {
  console.error(`✗ SQL 列分隔符红线被违反（${violations.length} 处）：`);
  for (const v of violations.slice(0, 30)) console.error("  - " + v);
  console.error("修法：列清单统一走 src/lib/utils/sql-columns.ts 的 columns(...)，片段本身不带逗号。");
  process.exit(1);
}
console.log(`✓ SQL 列分隔符红线通过（扫描 ${fileCache.length} 个文件，无自带分隔符的列片段、无「, FROM」形态）`);
