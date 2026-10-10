/**
 * 种子脚本 ↔ 结构基线 一致性门禁（根治「E2E 种子引用了已不存在的表/列」这类静默腐烂）
 *
 * @script scripts/gates/check-seed-schema-compat.mjs
 * @background seed-test-db.ts 长期按旧库模型写 INSERT（crm_membership_plans 已被原生权益模型
 *             取代、crm_users 的 user_key/role/is_vip/unlock_quota 已在影子表重排时删除），
 *             但没有任何检查会在 CI 里发现——只有等 e2e job 真跑到「写入种子数据」才炸。
 *             本门禁把这件事变成静态检查：拿 db/schema/*.sql 的列清单当事实源，
 *             逐条核对种子脚本里的表名与 INSERT 列清单。
 * @assertions
 *   S1  种子脚本引用的每张表都存在于结构基线（含 FROM / INTO / UPDATE / JOIN）
 *   S2  每条 INSERT 的列清单里的每个列名都属于目标表
 *   S3  每条 INSERT 的占位符个数 == 列个数（多插少报是钱路口径事故）
 * @limits 只做上述三条静态核对，不解析表达式：SET/WHERE 里的列名不在此门禁范围
 *         （写错会在运行时以 Unknown column 立刻暴露，且无法用正则可靠切出）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// 供自测用 fixture 覆盖（口径同 check-wide-table-ssot 的 SSOT_SCAN_ROOT）
const SCHEMA_DIR = resolve(process.env.SEED_SCHEMA_DIR || "db/schema");
const SEED_FILE = resolve(process.env.SEED_SQL_FILE || "scripts/gates/seed-test-db.ts");
// MySQL 自带库不是业务表，不能拿结构基线去卡
const BUILTIN_SCHEMAS = new Set(["information_schema", "mysql", "performance_schema", "sys", "dual"]);

/** 解析 CREATE TABLE 正文，收集 表名 → 列名集合 */
function parseBaseline(dir) {
  const tables = new Map();
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) {
    console.error(`❌ ${dir} 下没有 .sql：结构基线缺失，本门禁无法工作`);
    process.exit(1);
  }
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), "utf8");
    const re = /CREATE TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\n\)\s*(?:ENGINE|DEFAULT)/g;
    for (const m of sql.matchAll(re)) {
      const cols = new Set();
      for (const line of m[2].split("\n")) {
        const c = line.match(/^\s{2}`([^`]+)`\s/);
        if (c) cols.add(c[1]);
      }
      // 同名表在多文件出现时取并集（分库导出场景）
      tables.set(m[1], new Set([...(tables.get(m[1]) ?? []), ...cols]));
    }
  }
  return { tables, files };
}

/** 从 TS 源码里切出所有 SQL 字符串字面量（模板串与普通串都算） */
function extractSql(source) {
  const statements = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const m of source.matchAll(re)) {
    const body = m[2];
    if (/\b(INSERT|REPLACE)\b[\s\S]*\bVALUES\b/i.test(body)) statements.push({ kind: "insert", sql: body });
    else if (/^\s*(SELECT|UPDATE|DELETE)\b/i.test(body)) statements.push({ kind: "other", sql: body });
  }
  return statements;
}

function tableRefs(sql) {
  const out = [];
  for (const m of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)) {
    out.push(m[1]);
  }
  return out.filter((t) => !BUILTIN_SCHEMAS.has(t.toLowerCase()));
}

/** 按顶层逗号切分 VALUES 一组：引号内与括号内的逗号不算分隔（NOW() / DATE_ADD(a, b) 不拆） */
function splitValueItems(text) {
  const items = [];
  let cur = "";
  let quote = null;
  let depth = 0;
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  items.push(cur);
  return items.map((s) => s.trim());
}

/** 取一段文本里的第一个配平括号组内容（支持嵌套与引号）；不配平则返回 null */
function firstBalancedGroup(text) {
  const start = text.indexOf("(");
  if (start < 0) return null;
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

const problems = [];

const { tables, files } = parseBaseline(SCHEMA_DIR);
const source = readFileSync(SEED_FILE, "utf8");
const statements = extractSql(source);

if (!statements.length) {
  problems.push(`种子脚本里没解析出任何 SQL 语句，可能是本门禁的正则失效：${SEED_FILE}`);
}

for (const { sql } of statements) {
  const refs = tableRefs(sql);
  for (const t of refs) {
    if (!tables.has(t)) problems.push(`S1 未知表 ${t}（结构基线 ${files.join("/")} 里没有这张表）\n     语句：${sql.slice(0, 120)}…`);
  }

  // 必须允许 INSERT [IGNORE] [INTO] tbl：漏掉 INTO 会令所有 INSERT IGNORE INTO 静默逃检
  for (const m of sql.matchAll(/\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?(?:INTO\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*\(([^)]*)\)\s*VALUES/gi)) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim().replace(/`/g, "")).filter(Boolean);
    const known = tables.get(table);
    if (!known) continue; // S1 已报
    for (const col of cols) {
      if (!known.has(col)) {
        problems.push(`S2 ${table} 没有列 ${col}（种子脚本按旧库模型写的？该表实际列：${[...known].slice(0, 8).join(", ")}…）`);
      }
    }
    // 逐项而非只数 ?：VALUES 里写 NULL / 'bcrypt' 这类字面量是合法写法，
    // 只看 ? 会把它们当成缺项误报（真口径是「值的个数 == 列的个数」）。
    // 分组由模板动态拼出（${...}）时个数在静态阶段无法得知，跳过 S3（S2 仍生效）。
    const afterValues = m.input.slice(m.index + m[0].length).trimStart();
    if (!afterValues.startsWith("$")) {
      const inner = firstBalancedGroup(afterValues);
      if (inner !== null) {
        const items = splitValueItems(inner);
        if (items.length !== cols.length) {
          problems.push(`S3 ${table} 列 ${cols.length} 个但首组值 ${items.length} 个`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error("❌ 种子脚本与结构基线不一致：");
  for (const p of [...new Set(problems)]) console.error("  - " + p);
  console.error("\n口径：结构以 db/schema/*.sql 为事实源；改库先重跑 scripts/tools/dump-schema-baseline.mjs，再改 seed-test-db.ts。");
  process.exit(1);
}

console.log(
  `✅ 种子脚本与结构基线一致（${tables.size} 张表可引用，${statements.length} 条 SQL 通过 S1/S2/S3）`,
);
