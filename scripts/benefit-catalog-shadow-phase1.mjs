/**
 * 权益目录表列精简 · 影子表阶段一（ADR-0003）
 *
 * 做什么：
 *   ① 建影子表 crm_benefit_catalog__new（终态 6 列 + uk_benefit_sort + chk_enum_dict_v2）
 *   ② 按显式映射表回填 15 行并重编 sort_order 为全局唯一 10..150
 *   ③ 结构自检 + V1–V5 数据校验
 *   ④ FK 语义沙盘预演（方案 §3.4）：实测 MySQL 在 FOREIGN_KEY_CHECKS=0 下
 *      RENAME 被子表外键引用的父表时，子表引用跟随/悬空/拒绝 —— 结论决定阶段二切换形态
 *
 * 安全边界（硬约束）：
 *   - 主表 crm_benefit_catalog 只做只读 SELECT，绝不 DDL、绝不写入
 *   - 写操作只落在本脚本自建的三张表：crm_benefit_catalog__new / __sandbox / __fk_probe
 *   - 默认 dry-run（只读预检 + 打印计划）；要写库必须显式 --apply
 *   - --rebuild 才允许 DROP __new（且只允许这个名字）
 *
 * 用法：
 *   node scripts/benefit-catalog-shadow-phase1.mjs                 # dry-run
 *   node scripts/benefit-catalog-shadow-phase1.mjs --apply         # 建表+回填+校验+沙盘预演
 *   node scripts/benefit-catalog-shadow-phase1.mjs --apply --rebuild   # 先重建 __new
 *   node scripts/benefit-catalog-shadow-phase1.mjs --apply --no-probe  # 跳过沙盘预演
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { BENEFIT_SORT_MAP as SORT_MAP } from "./lib/benefit-catalog-sort-map.mjs";

const APPLY = process.argv.includes("--apply");
const REBUILD = process.argv.includes("--rebuild");
const NO_PROBE = process.argv.includes("--no-probe");

const SRC = "crm_benefit_catalog";
const NEW = "crm_benefit_catalog__new";
const SANDBOX = "crm_benefit_catalog__sandbox";
const SANDBOX_OLD = "crm_benefit_catalog__sandbox_old";
const PROBE = "__benefit_fk_probe";
/** 本脚本唯一允许被 DROP 的表名（防手滑） */
const DROP_ALLOWED = new Set([NEW, SANDBOX, SANDBOX_OLD, PROBE]);

/**
 * 方案 §1.2 的映射：benefit_code → 新 sort_order（由 lib/benefit-catalog-sort-map.mjs 单一来源提供）。
 * 不在本文件里各写一份：主表重编号（benefit-catalog-renumber-main）与回滚反解必须用同一张表，
 * 出现两份就会有"两个顺序事实源"——那正是本次切换要消除的毛病本身。
 */

/** 终态 6 列（方案 §1.1） */
const NEW_DDL = `
  CREATE TABLE IF NOT EXISTS \`${NEW}\` (
    \`benefit_code\` varchar(64)  NOT NULL COMMENT '权益稳定机器码，上线后不可改语义（如 notice_view）',
    \`name_zh\`      varchar(120) NOT NULL COMMENT '权益中文名，官网矩阵行名与卡片 chip 文案唯一来源',
    \`value_kind\`   enum('bool','enum','quota') NOT NULL
                     COMMENT '取值类型，决定 crm_plan_benefits 哪个值列有值：bool/enum→value_level，quota→value_num',
    \`level_dict\`   json DEFAULT NULL
                     COMMENT '枚举行各层级业务含义（值=价格文档单元格原文），非枚举行恒为 NULL',
    \`sort_order\`   int NOT NULL COMMENT '矩阵行全局唯一展示顺序；官网行序与价格体系文档 02 章一致',
    \`created_at\`   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`benefit_code\`),
    UNIQUE KEY \`uk_benefit_sort\` (\`sort_order\`),
    CONSTRAINT \`chk_enum_dict_v2\` CHECK ((\`value_kind\` <> _utf8mb4'enum') or (\`level_dict\` is not null))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='权益目录表：定义系统内每种权益的机器码、名称、取值类型与层级含义，是套餐权益矩阵与额度账本的前置字典'`;

const EXPECTED_COLS = ["benefit_code", "name_zh", "value_kind", "level_dict", "sort_order", "created_at"];

const L = [];
const log = (s = "") => {
  L.push(s);
  console.log(s);
};
function fail(msg) {
  L.push(`\n[FATAL] ${msg}`);
  L.push("\n阶段一终止：主表未受影响；已建的 __new/沙盘保留待查。");
  console.error(L[L.length - 2] + "\n" + L[L.length - 1]);
  dumpLog();
  process.exit(1);
}

/** 证据优先：不管正常结束、闸口拒绝还是未捕获异常，已收集的输出必须落盘 */
function dumpLog() {
  try {
    const outDir = path.join(__dirname, "out");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `benefit-catalog-shadow-phase1${APPLY ? "-apply" : "-dryrun"}.log`),
      L.join("\n") + "\n",
      "utf8",
    );
  } catch { /* 落盘失败不掩盖真实原因 */ }
}
process.on("uncaughtException", (e) => { L.push(`\n[UNCAUGHT] ${e?.stack || e}`); dumpLog(); console.error(e); process.exit(1); });
process.on("unhandledRejection", (e) => { L.push(`\n[UNHANDLED] ${e?.stack || e}`); dumpLog(); console.error(e); process.exit(1); });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z_]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});
const q = async (sql, params) => (await pool.query(sql, params))[0];
const tableExists = async (t) =>
  Number((await q(`SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [t]))[0].n) > 0;

log(`目标库：${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}  模式：${APPLY ? "APPLY（写库）" : "DRY-RUN（只读）"}`);
if (!(await tableExists(SRC))) fail(`主表 ${SRC} 不存在，目标库是否正确？`);

// ────────────────────────── 预检（永远只读） ──────────────────────────
log("\n[1] 预检（只读）");
const srcCols = (await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [SRC])).map((r) => r.COLUMN_NAME);
log(`  主表列数=${srcCols.length}：${srcCols.join(", ")}`);
for (const c of EXPECTED_COLS) if (!srcCols.includes(c)) fail(`主表缺列 ${c}，预检口径与方案不符`);

const rows = await q(
  `SELECT benefit_code, name_zh, group_code, value_kind, CAST(level_dict AS CHAR) level_dict,
          sort_order, is_active
     FROM ${SRC} ORDER BY group_code, sort_order, benefit_code`,
);
const active = rows.filter((r) => Number(r.is_active) === 1);
log(`  行数：总 ${rows.length} / is_active=1 ${active.length}`);
if (rows.length - active.length > 0)
  log(`  ⚠️ 停用行 ${rows.length - active.length} 条不进 __new：${rows.filter((r) => !Number(r.is_active)).map((r) => r.benefit_code).join(", ")}`);

const amountRows = active.filter((r) => r.value_kind === "amount");
if (amountRows.length > 0) fail(`value_kind='amount' 有 ${amountRows.length} 行（${amountRows.map((r) => r.benefit_code).join(",")}），与 ENUM 收缩前提冲突，先裁决这些行`);
const enumNoDict = active.filter((r) => r.value_kind === "enum" && (r.level_dict == null || r.level_dict === "NULL"));
if (enumNoDict.length > 0) fail(`枚举行缺 level_dict（会撞 chk_enum_dict_v2）：${enumNoDict.map((r) => r.benefit_code).join(",")}`);
const boolBad = active.filter((r) => r.value_kind === "bool" && r.level_dict != null && r.level_dict !== "NULL");
if (boolBad.length > 0) log(`  ⚠️ bool 行带 level_dict（不影响建表，仅提示）：${boolBad.map((r) => r.benefit_code).join(",")}`);

const unknown = active.filter((r) => SORT_MAP[r.benefit_code] === undefined);
log(`  映射表覆盖：${active.length - unknown.length}/${active.length}${unknown.length ? `，未覆盖需顺位编号：${unknown.map((r) => r.benefit_code).join(", ")}` : "，全部命中"}`);

const dupSort = await q(
  `SELECT sort_order, COUNT(*) n, GROUP_CONCAT(benefit_code) codes FROM ${SRC}
    WHERE is_active=1 GROUP BY sort_order HAVING n>1`,
);
log(`  现状 sort_order 跨组撞号：${dupSort.length ? dupSort.map((d) => `${d.sort_order}(${d.codes})`).join(" ") : "无"}`);

// V5 预检：三张子表的引用必须都能落到 __new（否则切换后重建外键会失败）
const REF_CHILDREN = [
  { table: "crm_plan_benefits", column: "benefit_code" },
  { table: "crm_benefit_quotas", column: "benefit_code" },
  { table: "crm_service_catalog", column: "grant_benefit_code" },
];
for (const rc of REF_CHILDREN) {
  if (!(await tableExists(rc.table))) {
    log(`  ⚠️ 子表 ${rc.table} 不存在，跳过其引用核对`);
    continue;
  }
  const [bad] = await q(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t
       LEFT JOIN \`${SRC}\` b ON b.benefit_code = t.\`${rc.column}\`
     WHERE t.\`${rc.column}\` IS NOT NULL AND b.benefit_code IS NULL`,
  );
  log(`  子表引用 ${rc.table}.${rc.column} 在主表悬空：${Number(bad.n)} 条`);
  if (Number(bad.n) > 0) log(`    ⚠️ 这些引用指向主表已不存在的码，切换后重建外键会失败 —— 必须在阶段二前清干净`);
}

log("\n[2] 回填映射（benefit_code → 新 sort_order）");
for (const r of active) {
  log(`  ${String(SORT_MAP[r.benefit_code] ?? "顺位").padStart(6)}  ← ${r.benefit_code}  (${r.group_code}/${r.sort_order}, ${r.value_kind})`);
}

log("\n[3] 终态 DDL（写入目标只有 " + NEW + "）");
log(NEW_DDL.replace(/\n\s{2}/g, "\n  "));

if (!APPLY) {
  log("\n[DRY-RUN] 到此为止，未写库。加 --apply 执行建表 + 回填 + 校验 + 沙盘预演。");
  await finish();
}

// ────────────────────────── 建表 + 回填 ──────────────────────────
if (REBUILD && (await tableExists(NEW))) {
  assertDroppable(NEW);
  await pool.query(`DROP TABLE \`${NEW}\``);
  log(`\n[4] --rebuild：已 DROP ${NEW}`);
}
const existed = await tableExists(NEW);
await pool.query(NEW_DDL);
log(`\n[4] ${NEW} ${existed ? "已存在（幂等 UPSERT 复跑）" : "已创建"}`);

let seq = Object.values(SORT_MAP).reduce((m, v) => Math.max(m, v), 0);
try {
  for (const r of active) {
    const so = SORT_MAP[r.benefit_code] ?? (seq += 10);
    await pool.execute(
      `INSERT INTO \`${NEW}\` (benefit_code, name_zh, value_kind, level_dict, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name_zh=VALUES(name_zh), value_kind=VALUES(value_kind),
                               level_dict=VALUES(level_dict), sort_order=VALUES(sort_order)`,
      [r.benefit_code, r.name_zh, r.value_kind === "amount" ? "quota" : r.value_kind, r.level_dict && r.level_dict !== "NULL" ? r.level_dict : null, so],
    );
  }
} catch (e) {
  if (e.code === "ER_DUP_ENTRY")
    fail(
      `回填撞 uk_benefit_sort（${e.sqlMessage}）：__new 里存在上一轮未完成的编号。` +
        `用 --apply --rebuild 整表重建，不要手改数据。`,
    );
  throw e;
}
log(`  回填完成：${active.length} 行（未映射码顺位编号至 ${seq}）`);

// ────────────────────────── 结构自检 ──────────────────────────
log("\n[5] 结构自检");
const newCols = await q(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [NEW]);
const names = newCols.map((r) => r.COLUMN_NAME);
if (names.join(",") !== EXPECTED_COLS.join(",")) fail(`${NEW} 列集合与终态不符：${names.join(",")}`);
log(`  列：${names.join(", ")} ✓（6 列，无退役列）`);
const vk = newCols.find((r) => r.COLUMN_NAME === "value_kind").COLUMN_TYPE;
if (vk !== "enum('bool','enum','quota')") fail(`value_kind ENUM 未收缩为 3 值：${vk}`);
log(`  value_kind = ${vk} ✓`);
const collation = async (t) => (await q(`SELECT TABLE_COLLATION col FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [t]))[0]?.col;
const newCol = collation(NEW);
const srcCol = collation(SRC);
if ((await newCol) !== (await srcCol)) fail(`表级排序规则不一致：${NEW}=${await newCol} / ${SRC}=${await srcCol}`);
// 外键两侧必须逐字一致：按列比 charset/collation/类型（TABLES 视图没有 CHARACTER_SET_NAME，只能走 COLUMNS）
const keyMeta = await q(
  `SELECT TABLE_NAME t, COLUMN_TYPE ct, CHARACTER_SET_NAME cs, COLLATION_NAME col
     FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?, ?) AND COLUMN_NAME='benefit_code'`,
  [NEW, SRC],
);
const km = Object.fromEntries(keyMeta.map((r) => [r.t, `${r.ct}/${r.cs}/${r.col}`]));
log(`  benefit_code 列定义：__new=${km[NEW]}  主表=${km[SRC]}`);
if (km[NEW] !== km[SRC]) fail(`benefit_code 两侧定义不一致，阶段二重建外键必失败：${km[NEW]} vs ${km[SRC]}`);
log(`  表级排序规则 ${(await newCol)} 与主表一致 ✓`);
const idx = await q(`SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`, [NEW]);
log(`  索引：${idx.map((r) => `${r.INDEX_NAME}(${r.COLUMN_NAME}${Number(r.NON_UNIQUE) ? "" : " UNIQUE"})`).join(", ")}`);
if (!idx.some((r) => r.INDEX_NAME === "uk_benefit_sort")) fail("缺 uk_benefit_sort：行序唯一无法由数据库保证");
const chk = await q(`SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='chk_enum_dict_v2'`);
if (chk.length === 0) fail("缺 chk_enum_dict_v2 CHECK 约束");
log("  CHECK chk_enum_dict_v2 存在 ✓");

// ────────────────────────── V1–V5 ──────────────────────────
log("\n[6] 数据校验 V1–V5");
const V = [];
const one = async (sql, params) => (await q(sql, params))[0];

const v1 = await one(`SELECT (SELECT COUNT(*) FROM \`${NEW}\`) n_new, (SELECT COUNT(*) FROM \`${SRC}\` WHERE is_active=1) n_src`);
V.push(["V1 行数相等", Number(v1.n_new) === Number(v1.n_src), `__new=${v1.n_new} / 主表 active=${v1.n_src}`]);

const v2 = await one(`SELECT COUNT(*) n, MIN(sort_order) mn, MAX(sort_order) mx FROM (SELECT DISTINCT sort_order FROM \`${NEW}\`) x`);
const v2cnt = await one(`SELECT COUNT(*) n FROM ${NEW}`);
V.push(["V2 sort_order 全局唯一", Number(v2.n) === Number(v2cnt.n), `不同值 ${v2.n} / 行数 ${v2cnt.n}，范围 ${v2.mn}..${v2.mx}`]);
const v2gap = await one(`SELECT GROUP_CONCAT(a.sort_order) holes FROM \`${NEW}\` a LEFT JOIN \`${NEW}\` b ON b.sort_order = a.sort_order + 10 WHERE b.benefit_code IS NULL AND a.sort_order < (SELECT MAX(sort_order) FROM \`${NEW}\`)`);
log(`     步长 10 的空洞（可留待新增权益插队）：${v2gap.holes ?? "无"}`);

const v3 = await one(
  `SELECT SUM(value_kind='enum' AND level_dict IS NULL) enum_no_dict,
          SUM(value_kind<>'enum' AND level_dict IS NOT NULL) non_enum_with_dict,
          SUM(value_kind='enum') enum_rows FROM ${NEW}`,
);
V.push(["V3 枚举行字典闭合", Number(v3.enum_no_dict ?? 0) === 0, `enum ${v3.enum_rows} 行全带字典；非枚举行带字典 ${Number(v3.non_enum_with_dict ?? 0)} 行`]);

const v4 = await one(
  `SELECT COUNT(*) diff FROM \`${SRC}\` s JOIN \`${NEW}\` n USING (benefit_code)
    WHERE s.name_zh <> n.name_zh OR s.value_kind <> n.value_kind
       OR NOT (s.level_dict IS NULL AND n.level_dict IS NULL OR CAST(s.level_dict AS CHAR) = CAST(n.level_dict AS CHAR))`,
);
V.push(["V4 逐行内容一致", Number(v4.diff) === 0, `name_zh/value_kind/level_dict 差异 ${v4.diff} 行`]);

let v5bad = 0;
const v5detail = [];
for (const rc of REF_CHILDREN) {
  if (!(await tableExists(rc.table))) continue;
  const [bad] = await q(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t
       LEFT JOIN \`${NEW}\` n ON n.benefit_code = t.\`${rc.column}\`
     WHERE t.\`${rc.column}\` IS NOT NULL AND n.benefit_code IS NULL`,
  );
  v5bad += Number(bad.n);
  v5detail.push(`${rc.table}=${Number(bad.n)}`);
}
V.push(["V5 子表引用零悬空", v5bad === 0, v5detail.join(" ") || "无子表"]);

for (const [name, ok, detail] of V) log(`  ${ok ? "✓" : "✗"} ${name}：${detail}`);
if (V.some(([, ok]) => !ok)) fail("V1–V5 未全绿，禁止进入阶段二");

// ────────────────────────── FK 语义沙盘预演 ──────────────────────────
if (!NO_PROBE) await fkSandboxRehearsal();

log("\n[7] 阶段一结论");
log(`  ${NEW} 已就绪且校验全绿；主表 ${SRC} 未被触碰（不改名、不删列、继续服务生产）。`);
log("  下一步（人工闸口后）：写 phase2-cutover（冻结→补增量→RENAME→无条件重建 3 个外键→P1–P6）。");
await finish();

/** 沙盘预演：只在本脚本自建的临时表上验证 rename 语义，绝不触碰主表
 *  ⚠️ 必须单连接：FOREIGN_KEY_CHECKS 是 SESSION 变量，走连接池会在下一条语句换连接而失效 */
async function fkSandboxRehearsal() {
  log("\n[7] FK 语义沙盘预演（方案 §3.4）");
  assertDroppable(SANDBOX);
  assertDroppable(SANDBOX_OLD);
  assertDroppable(PROBE);

  const conn = await pool.getConnection();
  try {
    await conn.query(`DROP TABLE IF EXISTS \`${PROBE}\``);
    await conn.query(`DROP TABLE IF EXISTS \`${SANDBOX_OLD}\``);
    await conn.query(`DROP TABLE IF EXISTS \`${SANDBOX}\``);

    await conn.query(`CREATE TABLE \`${SANDBOX}\` LIKE \`${NEW}\``);
    await conn.query(`INSERT INTO \`${SANDBOX}\` SELECT * FROM \`${NEW}\``);
    await conn.query(
      `CREATE TABLE \`${PROBE}\` (
         id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
         benefit_code varchar(64) NOT NULL,
         CONSTRAINT \`fk_probe_benefit\` FOREIGN KEY (benefit_code) REFERENCES \`${SANDBOX}\` (\`benefit_code\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    );
    const [[first]] = await conn.query(`SELECT benefit_code FROM \`${SANDBOX}\` LIMIT 1`);
    const [[cnt]] = await conn.query(`SELECT COUNT(*) n FROM \`${SANDBOX}\``);
    await conn.execute(`INSERT INTO \`${PROBE}\` (benefit_code) VALUES (?)`, [first.benefit_code]);
    log(`  沙盘建好：${SANDBOX}（${cnt.n} 行）+ 子表 ${PROBE} 引用 ${first.benefit_code}`);

    await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 0");
    let renameErr = null;
    try {
      await conn.query(`RENAME TABLE \`${SANDBOX}\` TO \`${SANDBOX_OLD}\``);
    } catch (e) {
      renameErr = e;
    } finally {
      await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 1");
    }

    if (renameErr) {
      log(`  ✗ rename 被拒：${renameErr.code || ""} ${renameErr.sqlMessage || renameErr.message}`);
      log("    → 结论分支①：阶段二必须先 DROP 三个外键再 RENAME，然后 ADD 回来。");
    } else {
      const [after] = await conn.query(
        `SELECT REFERENCED_TABLE_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME='fk_probe_benefit'`,
        [PROBE],
      );
      const ref = after[0]?.REFERENCED_TABLE_NAME;
      log(`  rename 成功；子表外键现指向：${ref}`);
      // 行为级验证：FK 若仍生效，删掉被引用行应被拒
      let enforced;
      try {
        await conn.execute(`DELETE FROM \`${SANDBOX_OLD}\` WHERE benefit_code = ?`, [first.benefit_code]);
        enforced = false;
      } catch (e) {
        enforced = e.code === "ER_ROW_IS_REFERENCED_2" || /referenced/i.test(e.sqlMessage || "");
      }
      log(`  FK 是否仍在拦截删除：${enforced ? "是（引用仍有效）" : "否（引用已失保护）"}`);
      if (ref === SANDBOX) log("    → 结论分支②：引用停在旧名（悬空）→ 阶段二 RENAME 后必须重建 3 个外键。");
      else if (ref === SANDBOX_OLD) log("    → 结论分支③：引用跟随改名 → 阶段二 RENAME 后会指向 __old 表，同样必须重建外键。");
      else log(`    → 观察到未知形态（${ref}），按「无条件重建外键」处理。`);
      log("  本方案 §4.3 已按「RENAME 后无条件重建 3 个外键」编写，上述任一分支都被覆盖。");
    }
  } finally {
    // 子表必须先删：否则父表被外键引用而无法 DROP
    await conn.query(`DROP TABLE IF EXISTS \`${PROBE}\``).catch(() => {});
    await conn.query(`DROP TABLE IF EXISTS \`${SANDBOX_OLD}\``).catch(() => {});
    await conn.query(`DROP TABLE IF EXISTS \`${SANDBOX}\``).catch(() => {});
    conn.release();
    log("  沙盘与探针已清理。");
  }
}

function assertDroppable(name) {
  if (!DROP_ALLOWED.has(name)) fail(`拒绝 DROP 非本脚本自建的表：${name}`);
}

async function finish() {
  dumpLog();
  await pool.end();
  console.log(`日志留档：scripts/out/benefit-catalog-shadow-phase1${APPLY ? "-apply" : "-dryrun"}.log`);
  // 所有终止路径都经 finish()：dry-run 与 apply 均到此退出，不得继续往下执行
  process.exit(process.exitCode ?? 0);
}
