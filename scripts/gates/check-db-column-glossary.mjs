import fs from "node:fs";
import path from "node:path";
import { reportAndExit, printStale } from "./lib/api-contract.mjs";

/**
 * 架构红线守卫：数据库列名对照表（glossary）——同义必须同名，后缀必须名实相符
 *
 * @module scripts/gates/check-db-column-glossary.mjs
 *
 * 背景（2026-10-27）：API 响应命名红线② 的 27 项存量里，绝大多数不是"列名起得烂"，
 *   而是 `{ ...row }` 把物理列名直接当成了对外契约。列名本身经全库核查（114 表 / 1378 列）
 *   纪律良好：`user_id` 30 列零别名、`supplier_id` 10 列零别名、`created_at` 72 / `updated_at` 48。
 *   本门禁固化的正是这份**核查判定**：既拦今后新增的别名与名实不符，也防止有人"顺手统一"
 *   把本就该异名的两列并成一列（那类合并会直接造 bug——外部编号与内部主键同名即撞号）。
 *
 * 规则：
 *   BG1 [GLOSSARY-ALIAS]  同一概念（同含义 + 同类型 + 同单位）必须同名：
 *        命中 GLOSSARY 里某概念的 alias 且不是 canonical → 违规（存量入 FROZEN_ALIASES 冻结）。
 *   BG2 [SUFFIX-TYPE]     后缀即语义承诺，名实必须相符：
 *        `*_ts` → 整数（epoch 秒）；`*_at` → DATETIME/TIMESTAMP/DATE；`*_url|*_uri` → 字符类型。
 *        违规 exit 1（存量入 FROZEN_SUFFIX 冻结并注明原因）。
 *
 * 已核实为**不同含义、禁止合并**的列族（不产生违规，仅作判定留档）：
 *   · deadline(varchar 原文串) ≠ deadline_ts(bigint epoch) ≠ deadline_sec(生成列，ms→s 归一)
 *   · published_date(varchar 原文发布日期) ≠ published_ts(bigint epoch 秒)
 *   · country(国家/地区名) ≠ country_code(char2 ISO 单码) ≠ country_codes(多码 JSON/CSV)
 *   · source(provenance 来源渠道) ≠ source_url(原文链接) ≠ host(注册域) ≠ platform_name(归一规范名)
 *   · notice_id(外部编号，实测会撞号) ≠ notice_pk(内部主键，服务表 1:1 锚点)
 *   · currency(varchar10) == currency_code(char3 ISO4217) —— 唯一确证的同义别名，故入 GLOSSARY
 *
 * 扫描范围与建表字符集门禁同源：src / scripts / db/schema 下的 .sql/.ts/.tsx/.js/.mjs/.cjs，
 *   因此写在新迁移里的 CREATE TABLE 与 ALTER TABLE ADD/CHANGE COLUMN 一并受约束。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 * 扫描根可用环境变量 DB_GLOSSARY_SCAN_ROOT 覆盖（供夹具自测使用）。
 */
const ROOT = process.env.DB_GLOSSARY_SCAN_ROOT || process.cwd();
const SCAN_DIRS = ["src", "scripts", "db/schema"].map((d) => path.join(ROOT, d));
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]);

/** 同义别名表：一个概念一名一单位。新增条目必须在此注明判定依据 */
const GLOSSARY = [
  {
    concept: "币种（ISO 4217 码）",
    canonical: "currency",
    aliases: ["currency_code", "currency_iso", "ccy"],
    // 依据：全库 currency 12 列均为 varchar(10) 存 ISO 码；currency_code 仅 1 列（服务宽表）
    // char(3) 同含义同单位，属真别名。新列一律写 currency；宽表该列随下次表重构收敛。
  },
];

/** BG1 存量冻结（`table.column`）：随迁移删除对应行，只减不增 */
const FROZEN_ALIASES = new Set([
  "notice_public.currency_code", // 服务宽表投影列，改名需同步 notice-public 构建器与检索映射
]);

/** BG2 存量冻结（`table.column`）：`_at` 却存 Unix 秒 = 名实不符的技术债清单 */
const FROZEN_SUFFIX = new Set([
  "email_accounts.last_sync_at",
  "email_accounts.last_check_at",
  "email_unsubscribe.unsubscribe_at",
  "notice_public.updated_at",
  "rfq_outreach.contacted_at",
]);

const TYPE_INT = /^(BIGINT|INT|INTEGER|TINYINT|SMALLINT|MEDIUMINT)\b/i;
const TYPE_DATETIME = /^(DATETIME|TIMESTAMP|DATE)\b/i;
const TYPE_STR = /^(VARCHAR|CHAR|TEXT|LONGTEXT|MEDIUMTEXT|TINYTEXT|JSON)\b/i;
// 列定义行：`col` TYPE ...，并排除 KEY/INDEX/CONSTRAINT 等表约束行
const COL_RE = /^\s*`?([a-z0-9_]+)`?\s+(BIGINT|INT|INTEGER|TINYINT|SMALLINT|MEDIUMINT|DECIMAL|NUMERIC|VARCHAR|CHAR|TEXT|LONGTEXT|MEDIUMTEXT|DATETIME|TIMESTAMP|DATE|TIME|YEAR|JSON|BOOLEAN|BOOL|DOUBLE|FLOAT)\b/i;
const NOT_A_COLUMN = /^(primary|unique|key|index|constraint|fulltext|foreign|check)$/i;

/** 从 CREATE TABLE 的列定义体里抽 (列名, 类型) */
function columnsOfBody(body) {
  const out = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    // 生成列与普通列一样按声明类型判定；约束行、索引行跳过
    const m = line.match(COL_RE);
    if (!m || NOT_A_COLUMN.test(m[1])) continue;
    out.push({ name: m[1], type: m[2].toUpperCase() });
  }
  return out;
}

/** 找到 openIdx 处左括号匹配的右括号，返回括号内文本（跳过字符串内的括号） */
function parenBody(text, openIdx) {
  let depth = 0, inStr = false, strCh = "";
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
  }
  return null;
}

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

/** 全部受检列：table -> [{ name, type, where }] */
const tableCols = new Map();
let tableCount = 0;
function addCol(table, col, where) {
  if (!tableCols.has(table)) tableCols.set(table, []);
  tableCols.get(table).push({ ...col, where });
}

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  const lineAt = (idx) => text.slice(0, idx).split(/\r?\n/).length;

  // ① 建表语句：表名后紧跟左括号列清单（不写成字面例子的形式，否则会被
  // check-ddl-collation 当成真建表报 DC3——本仓门禁互扫，注释也是它的射程）
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_$]*))/gi;
  let m;
  while ((m = createRe.exec(text))) {
    const table = m[1] ?? m[2];
    const open = text.indexOf("(", m.index);
    if (open < 0) continue;
    const body = parenBody(text, open);
    if (body === null) continue;
    tableCount++;
    const where = `${rel}:${lineAt(m.index)}`;
    for (const c of columnsOfBody(body)) addCol(table, c, where);
  }

  // ② ALTER TABLE t ADD [COLUMN] col TYPE  /  ADD (a TYPE, b TYPE)  /  CHANGE [COLUMN] old new TYPE
  const alterRe = /ALTER\s+TABLE\s+(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_$]*))\s+(ADD|CHANGE|MODIFY)\s+([\s\S]*?)(?=;|\n\s*(?:ALTER|CREATE|COMMENT)\b|$)/gi;
  let a;
  while ((a = alterRe.exec(text))) {
    const table = a[1] ?? a[2];
    const tail = a[4];
    const where = `${rel}:${lineAt(a.index)}`;
    // ADD ( a TYPE, b TYPE ) 形式
    const openParen = tail.indexOf("(");
    if (/^\s*(COLUMN\s+)?\(/.test(tail) && openParen >= 0) {
      const inner = parenBody(tail, openParen);
      if (inner) for (const c of columnsOfBody(inner)) addCol(table, c, where);
      continue;
    }
    // ADD [COLUMN] col TYPE / CHANGE [COLUMN] old new TYPE
    const one = tail.match(/^\s*(?:COLUMN\s+)?`?([a-z0-9_]+)`?\s+(?:`?([a-z0-9_]+)`?\s+)?(BIGINT|INT|INTEGER|TINYINT|SMALLINT|MEDIUMINT|DECIMAL|NUMERIC|VARCHAR|CHAR|TEXT|LONGTEXT|MEDIUMTEXT|DATETIME|TIMESTAMP|DATE|TIME|YEAR|JSON|BOOLEAN|BOOL|DOUBLE|FLOAT)\b/i);
    if (!one) continue;
    const name = one[2] && !/^(BIGINT|INT|INTEGER|TINYINT|SMALLINT|MEDIUMINT|DECIMAL|NUMERIC|VARCHAR|CHAR|TEXT|LONGTEXT|MEDIUMTEXT|DATETIME|TIMESTAMP|DATE|TIME|YEAR|JSON|BOOLEAN|BOOL|DOUBLE|FLOAT)$/i.test(one[2]) ? one[2] : one[1];
    addCol(table, { name, type: one[3].toUpperCase() }, where);
  }
}

const problems = [];
const hitAliases = new Set();
const hitSuffix = new Set();
const aliasByCanonical = new Map();
for (const g of GLOSSARY) for (const al of g.aliases) aliasByCanonical.set(al.toLowerCase(), g);

for (const [table, cols] of tableCols) {
  for (const c of cols) {
    const id = `${table}.${c.name}`;

    // BG1 同义别名
    const g = aliasByCanonical.get(c.name.toLowerCase());
    if (g) {
      hitAliases.add(id);
      if (FROZEN_ALIASES.has(id)) continue;
      problems.push(`[GLOSSARY-ALIAS] ${c.where}: ${id} 与 ${table}.${g.canonical} 同含义（${g.concept}）——同义必须同名，请用 \`${g.canonical}\`；确属不同含义请把该名字加入 GLOSSARY 判定注释，而不是加冻结行`);
    }

    // BG2 后缀-类型
    let why = null;
    if (/_ts$/.test(c.name) && !TYPE_INT.test(c.type)) why = "`_ts` 承诺 epoch 秒，应为整数列";
    else if (/_at$/.test(c.name) && !TYPE_DATETIME.test(c.type)) why = `\`_at\` 承诺日期时间，实为 ${c.type}`;
    else if (/_(url|uri)$/.test(c.name) && !TYPE_STR.test(c.type)) why = `\`_url\`/\`_uri\` 承诺链接字符串，实为 ${c.type}`;
    if (why) {
      hitSuffix.add(id);
      if (FROZEN_SUFFIX.has(id)) continue;
      problems.push(`[SUFFIX-TYPE] ${c.where}: ${id} 违反后缀语义——${why}`);
    }
  }
}

// 冻结表卫生：已不再命中的登记行 = 该删（自己判，不用 api-contract 的文件存在性版本——
// 这里登记的是 `table.column` 而非文件路径）
const stale = [];
for (const id of FROZEN_ALIASES) if (!hitAliases.has(id)) stale.push(`${id}（已不再命中，请从 FROZEN_ALIASES 删除该行）`);
for (const id of FROZEN_SUFFIX) if (!hitSuffix.has(id)) stale.push(`${id}（已不再命中，请从 FROZEN_SUFFIX 删除该行）`);

const colTotal = [...tableCols.values()].reduce((s, v) => s + v.length, 0);
// 卫生提示显式先打：共享 reportAndExit 只在零违规时打，但「冻结行已过期」在失败现场同样需要看到
// （否则人改完违规才知道白名单该删，多跑一轮）。因此不再把 stale 传给 reportAndExit，避免成功路径重复打印。
printStale(stale, "DB-GLOSSARY");
reportAndExit({
  tag: "DB-GLOSSARY",
  title: "列名对照表与后缀语义",
  problems,
  shown: 40,
  stale: [],
  okLine: `✓ 列名对照表红线通过（扫描 ${files.length} 个文件、${tableCount} 张 CREATE TABLE / 共 ${colTotal} 列，别名冻结 ${FROZEN_ALIASES.size} 项、后缀冻结 ${FROZEN_SUFFIX.size} 项）`,
  guidance: "准则：同含义同类型同单位 → 必同名；异含义 → 必异名（见文件头判定表）。后缀承诺：_ts=整数 epoch 秒、_at=日期时间、_url/_uri=字符串。",
});
