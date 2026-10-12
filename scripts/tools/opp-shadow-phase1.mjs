/**
 * crm_bid_opportunities 影子表精简 · 阶段一（建表 + 改结构 + 回填 + 校验）
 *
 * 纪律见 docs/adr/0003-shadow-table-blue-green-migration.md：
 *   阶段一全程**不触碰原表**，原表继续服务生产；只创建 `<原表>__new`、在其上改结构、
 *   分批回填、逐片对账，然后**停下等人工确认**。切换（RENAME）在阶段二脚本里。
 *
 * 用法：
 *   node --env-file=.env scripts/tools/opp-shadow-phase1.mjs             # 只打印计划 + 前置体检（默认，不写库）
 *   node --env-file=.env scripts/tools/opp-shadow-phase1.mjs --build     # 执行阶段一
 *   node --env-file=.env scripts/tools/opp-shadow-phase1.mjs --rollback  # 删掉影子表（原表不受影响）
 *
 * 前置断言（不满足即退出，绝不静默降级）：
 *   - 清单与现网一致：DROP_COLUMNS / GUARDED_COLUMNS / DROP_INDEXES 逐个存在
 *   - 影子表不存在
 *   - 打印按名引用本表的外键，供人工核对（ADR「外键」条）
 *
 * ⚠️ 库归属（2026-10-12 探针实测）：`.env` 的 127.0.0.1:3307 是 **云生产库** 的 SSH 隧道本地端口
 *   （MySQL 自报 `@@hostname=lavm-pn1wgls09p` / `@@port=3306`，详见 docs/adr/0012），
 *   而非本机镜像库。故 --build 就是直接在现网上建 2× 磁盘的影子表并全表回填，
 *   必须选低峰窗口，并确保 daily-sync 本轮写入不扰动对账（对账不一致时会提示重跑窗口）。
 */
import mysql from "mysql2/promise";
import {
  OPP_TABLE, SHADOW_TABLE, DROP_COLUMNS, DROP_INDEXES, GUARDED_COLUMNS,
  KEPT_INDEXES, BACKFILL_BATCH, keptColumns,
} from "./opp-slim-plan.mjs";

const BUILD = process.argv.includes("--build");
const ROLLBACK = process.argv.includes("--rollback");

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
const q = async (sql) => (await conn.query(sql))[0];
const fatal = (msg) => {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
};

/** 现网列元信息（含生成列标记） */
const columnsOf = (table) => q(
  `SELECT COLUMN_NAME name, DATA_TYPE type, UPPER(EXTRA) extra
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION`,
);
async function indexesOf(table) {
  const rows = await q(
    `SELECT INDEX_NAME name, COLUMN_NAME col FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
  );
  const map = new Map();
  for (const r of rows) map.set(r.name, [...(map.get(r.name) ?? []), r.col]);
  return map;
}

// ── 前置体检 ────────────────────────────────────────────────────────────
if (!(await q(`SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${OPP_TABLE}'`))[0].n) {
  fatal(`原表 ${OPP_TABLE} 不存在（连错库？当前库=${process.env.DB_NAME}）`);
}

const srcCols = await columnsOf(OPP_TABLE);
const srcNames = srcCols.map((c) => c.name);
const shadowExists = !!(await q(
  `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${SHADOW_TABLE}'`,
))[0].n;

const missingDrop = DROP_COLUMNS.filter((c) => !srcNames.includes(c));
const missingGuard = GUARDED_COLUMNS.filter((c) => !srcNames.includes(c));
if (missingDrop.length) fatal(`清单与现网漂移：待删列不存在 → ${missingDrop.join(", ")}`);
if (missingGuard.length) fatal(`保护列缺失 → ${missingGuard.join(", ")}（禁止在此状态下精简）`);

const srcIdx = await indexesOf(OPP_TABLE);
const missingIdx = DROP_INDEXES.filter((i) => !srcIdx.has(i.name));
if (missingIdx.length) fatal(`待删索引不存在 → ${missingIdx.map((i) => i.name).join(", ")}`);

const fks = await q(
  `SELECT CONCAT(TABLE_NAME,'.',COLUMN_NAME) ref, CONSTRAINT_NAME cst
     FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = '${OPP_TABLE}'`,
);
const isGenerated = (c) => srcCols.find((x) => x.name === c)?.extra.includes("GENERATED");
const writeCols = keptColumns(srcNames).filter((c) => !isGenerated(c));
const generatedKept = keptColumns(srcNames).filter(isGenerated);
const totalRows = (await q(`SELECT COUNT(*) n FROM \`${OPP_TABLE}\``))[0].n;
const size = (await q(
  `SELECT ROUND(DATA_LENGTH/1048576,1) dm, ROUND(INDEX_LENGTH/1048576,1) im
     FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${OPP_TABLE}'`,
))[0];

console.log(`库 ${process.env.DB_NAME} · 表 ${OPP_TABLE}`);
console.log(`行数 ${totalRows} · 列 ${srcNames.length} → ${srcNames.length - DROP_COLUMNS.length}（删 ${DROP_COLUMNS.length}）· 索引 ${srcIdx.size} → ${KEPT_INDEXES.length}（删 ${DROP_INDEXES.length}）`);
console.log(`体积 data ${size.dm} MB + index ${size.im} MB ⇒ 影子表额外占用约 ${size.dm} MB（ADR-0003 已知代价：临时 2× 磁盘）`);
console.log(`生成列（不参与写入，切换后逐行比对定义）：${generatedKept.join(", ") || "无"}`);
console.log(fks.length ? `按名引用本表的外键：${fks.map((f) => `${f.ref}→${f.cst}`).join(", ")}` : "无外键引用本表");
console.log(`影子表 ${SHADOW_TABLE} ${shadowExists ? "已存在（需先 --rollback）" : "不存在"}`);

if (!BUILD && !ROLLBACK) {
  /** 与真实执行同构的多动作清单拼接（分隔符只有一处，避免 print-plan 与实际 SQL 漂移） */
  const altLines = (items) => items.map((s) => `    ${s}`).join(",\n");
  console.log("\n[--print-plan] 未写库。将执行的 DDL：");
  console.log(`  CREATE TABLE \`${SHADOW_TABLE}\` LIKE \`${OPP_TABLE}\`;`);
  console.log(`  ALTER TABLE \`${SHADOW_TABLE}\`\n${altLines(DROP_INDEXES.map((i) => `DROP INDEX \`${i.name}\``))};`);
  console.log(`  ALTER TABLE \`${SHADOW_TABLE}\`\n${altLines(DROP_COLUMNS.map((c) => `DROP COLUMN \`${c}\``))};`);
  console.log(`  回填：按 id 分段 INSERT INTO \`${SHADOW_TABLE}\` (${writeCols.length} 列) SELECT ...，每批 ${BACKFILL_BATCH} 行`);
  console.log(`  对账：分片 COUNT + 逐列 NULL/值指纹 CRC32，另逐行比对生成列 ${generatedKept.join(",")}`);
  console.log("\n确认无误后加 --build 执行阶段一（原表不动）。");
  process.exit(0);
}

if (ROLLBACK) {
  if (!shadowExists) {
    console.log("影子表不存在，无需回滚。");
    process.exit(0);
  }
  await conn.query(`DROP TABLE \`${SHADOW_TABLE}\``);
  console.log(`✅ 已 DROP \`${SHADOW_TABLE}\`；原表 \`${OPP_TABLE}\` 未受影响。`);
  process.exit(0);
}

// ── 执行阶段一 ──────────────────────────────────────────────────────────
if (shadowExists) fatal(`影子表已存在，先跑 --rollback 清干净再重建（不做静默覆盖）`);

console.log("\n[1/5] CREATE TABLE LIKE");
await conn.query(`CREATE TABLE \`${SHADOW_TABLE}\` LIKE \`${OPP_TABLE}\``);

console.log("[2/5] 影子表上删冗余索引");
await conn.query(
  `ALTER TABLE \`${SHADOW_TABLE}\` ${DROP_INDEXES.map((i) => `DROP INDEX \`${i.name}\``).join(", ")}`,
);

console.log("[3/5] 影子表上删死列 / 无消费列");
await conn.query(
  `ALTER TABLE \`${SHADOW_TABLE}\` ${DROP_COLUMNS.map((c) => `DROP COLUMN \`${c}\``).join(", ")}`,
);

// 结构自检：列/索引/生成列表达式/排序规则都要与预期一致
const newCols = (await columnsOf(SHADOW_TABLE)).map((c) => c.name);
const newIdx = await indexesOf(SHADOW_TABLE);
const leaked = DROP_COLUMNS.filter((c) => newCols.includes(c));
if (leaked.length) fatal(`删列未生效：${leaked.join(", ")}`);
const idxLeft = [...newIdx.keys()].filter((n) => DROP_INDEXES.some((i) => i.name === n));
if (idxLeft.length) fatal(`删索引未生效：${idxLeft.join(", ")}`);
const genExprOf = async (table) => (await q(
  `SELECT GENERATION_EXPRESSION e FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND EXTRA LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION`,
)).map((r) => String(r.e).replace(/\s+/g, ""));
const genSrc = await genExprOf(OPP_TABLE);
const genNew = await genExprOf(SHADOW_TABLE);
if (JSON.stringify(genSrc) !== JSON.stringify(genNew)) fatal(`生成列表达式漂移：${JSON.stringify(genSrc)} vs ${JSON.stringify(genNew)}`);
const collOf = (table) => q(
  `SELECT TABLE_COLLATION c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}'`,
);
const [srcColl, newColl] = [(await collOf(OPP_TABLE))[0].c, (await collOf(SHADOW_TABLE))[0].c];
if (srcColl !== newColl) fatal(`排序规则漂移：${srcColl} → ${newColl}`);
console.log(`  结构自检通过：列 ${newCols.length} · 索引 ${newIdx.size}（${[...newIdx.keys()].sort().join(", ")}）· 排序规则 ${newColl}`);

console.log(`[4/5] 分批回填（${BACKFILL_BATCH} 行/批）`);
const colList = writeCols.map((c) => `\`${c}\``).join(", ");
let lastId = 0;
let moved = 0;
for (;;) {
  const res = await conn.query(
    `INSERT INTO \`${SHADOW_TABLE}\` (${colList})
     SELECT ${colList} FROM \`${OPP_TABLE}\` WHERE \`id\` > ? ORDER BY \`id\` LIMIT ${BACKFILL_BATCH}`,
    [lastId],
  );
  moved += res[0].affectedRows;
  const peek = await q(
    `SELECT MAX(id) mx FROM (SELECT \`id\` FROM \`${OPP_TABLE}\` WHERE \`id\` > ${lastId} ORDER BY \`id\` LIMIT ${BACKFILL_BATCH}) t`,
  );
  if (peek[0].mx == null) break;
  lastId = Number(peek[0].mx);
  process.stdout.write(`\r  已过 id ≤ ${lastId}，累计 ${moved} 行        `);
}
console.log("");

console.log("[5/5] 对账校验（行数 + 逐片列指纹 + 生成列逐行比对）");
const shadowTotal = (await q(`SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\``))[0].n;
if (shadowTotal !== totalRows) fatal(`行数不等：原表 ${totalRows} vs 影子表 ${shadowTotal}`);

// NULL 与空串必须可区分：每列单独加「非空」标记，否则 CONCAT_WS 会跳过 NULL 造成两者同码
const colTerm = (c) =>
  `IF(\`${c}\` IS NULL, CHAR(1 USING utf8mb4), CONCAT(CHAR(2 USING utf8mb4), IFNULL(CAST(\`${c}\` AS CHAR), '')))`;
const fpExpr = `SUM(CRC32(CONCAT(${writeCols.map(colTerm).join(", ")})))`;
const { lo, hi } = (await q(`SELECT MIN(id) lo, MAX(id) hi FROM \`${OPP_TABLE}\``))[0];
let slices = 0;
for (let a = Number(lo ?? 0); a <= Number(hi ?? 0); a += 5000) {
  const b = a + 4999;
  const sql = (t) => `SELECT COUNT(*) n, ${fpExpr} fp FROM \`${t}\` WHERE \`id\` BETWEEN ${a} AND ${b}`;
  const [x, y] = [await q(sql(OPP_TABLE)), await q(sql(SHADOW_TABLE))];
  slices++;
  if (x[0].n !== y[0].n || String(x[0].fp) !== String(y[0].fp)) {
    fatal(
      `内容对账不一致：id ∈ [${a},${b}] 原表 n=${x[0].n} fp=${x[0].fp} · 影子表 n=${y[0].n} fp=${y[0].fp}（禁止进入阶段二）。\n`
      + "  最常见原因不是数据错值，而是回填期间 daily-sync 又写了原表（本库是云生产库）："
      + "等下一轮同步间隙重跑，或先冻结同步再 --rollback + --build。",
    );
  }
}
for (const g of generatedKept) {
  const bad = (await q(
    `SELECT COUNT(*) n FROM \`${OPP_TABLE}\` o JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id WHERE NOT (o.\`${g}\` <=> s.\`${g}\`)`,
  ))[0].n;
  if (Number(bad) !== 0) fatal(`生成列 ${g} 逐行不等 ${bad} 行`);
}

// 自增值必须 ≥ 原表，否则切换后主键冲突
const aiOf = async (t) => Number((await q(
  `SELECT AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${t}'`,
))[0].ai ?? 0);
const [aiSrc, aiNew] = [await aiOf(OPP_TABLE), await aiOf(SHADOW_TABLE)];
if (aiNew < aiSrc) {
  await conn.query(`ALTER TABLE \`${SHADOW_TABLE}\` AUTO_INCREMENT = ${aiSrc}`);
  console.log(`  AUTO_INCREMENT 已抬升至 ${aiSrc}`);
}

console.log(`\n✅ 阶段一完成：\`${SHADOW_TABLE}\` 已就位（${shadowTotal} 行 · ${slices} 片对账全一致 · 生成列逐行一致）`);
console.log(`原表 \`${OPP_TABLE}\` **未被触碰**，生产读路径仍走原表。`);
console.log("\n下一步（须人工确认后进行，见阶段二脚本）：");
console.log("  1) 冻结外部同步：停 daily-sync 进程，或置 SYNC_WORKER_IN_APP=off（应用内 worker）");
console.log("  2) node --env-file=.env scripts/tools/opp-shadow-phase2-cutover.mjs --diff      # 只看回填后新增/变更的行");
console.log("  3) node --env-file=.env scripts/tools/opp-shadow-phase2-cutover.mjs --cutover   # 补增量 + 原子 RENAME");
console.log("  4) 稳定后人工 DROP 旧表位，并用 scripts/tools/dump-schema-baseline.mjs 重导 baseline.sql");
await conn.end();
