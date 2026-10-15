/**
 * crm_bid_notices 影子表精简 · 阶段一（建表 + 改结构 + 回填 + 校验，全程不触碰原表）
 *
 * 纪律见 docs/adr/0003-shadow-table-blue-green-migration.md：
 *   阶段一只创建 `<原表>__new`，**旧表不改名、继续跑生产**；到此为止不 RENAME。
 *   切换（原子 RENAME）在阶段二脚本里，且必须人工确认 + 冻结外部同步。
 *
 * 用法：
 *   node --env-file=.env scripts/tools/notices-shadow-phase1.mjs                 # 只打印计划 + 前置体检（默认，不写库）
 *   node --env-file=.env scripts/tools/notices-shadow-phase1.mjs --build         # 执行阶段一
 *   node --env-file=.env scripts/tools/notices-shadow-phase1.mjs --rollback      # 删掉影子表（原表不受影响）
 *   加 --batch=N 指定批次（默认 1；批次含义见 scripts/tools/notices-slim-plan.mjs）
 *
 * 前置断言（不满足即退出，绝不静默降级）：
 *   A1 待删列全部在场、保护列全部在场（清单与现网漂移即停）
 *   A2 待删列**不得有任何本表读写点**（复用 lib/notices-ref-scan.mjs 的判据；
 *      批次三那类「还在被宽表构建层/指纹读」的列会被这条硬拦，逼先把清障做完）
 *   A3 待删列不得出现在任何索引里（否则删列会连带改索引，超出本批范围）
 *   A4 影子表不存在（存在就得先 --rollback，不做静默覆盖）
 *   A5 打印按名引用本表的外键与触发器，供人工核对（ADR「外键」「触发器」条）
 *
 * ⚠️ 库归属：`.env` 的 127.0.0.1:3307 是**云生产库**的 SSH 隧道本地端口（docs/adr/0012），
 *   --build 会直接在现网建约 2× 磁盘的影子表并全表回填，必须选低峰窗口。
 *   本表带 3 个 FULLTEXT 索引（ngram 解析），故本脚本先摘 FT 索引、灌完数据再重建：
 *   边插边维护全文倒排是净亏（每批都要 delta merge），一次批量建索引才划算。
 */
import {
  NOTICES_TABLE, SHADOW_TABLE, GUARDED_COLUMNS, BACKFILL_BATCH,
  dropColumnsOf, keptColumns, BATCHES,
} from "./notices-slim-plan.mjs";
import { findNoticeRefSites } from "./lib/notices-ref-scan.mjs";
import { conn, fatal, columnsOf, indexesOf, tableExists, reconcile, makeProgress } from "./lib/notices-slim-common.mjs";

const BUILD = process.argv.includes("--build");
const ROLLBACK = process.argv.includes("--rollback");
const BATCH = Number((process.argv.find((a) => a.startsWith("--batch=")) ?? "").split("=")[1] ?? 1);
const RECONCILE_SLICE = 2000; // 对账窗口行数（本表含 LONGTEXT，窗口越大单条 SQL 越重）

const c = await conn();
const DROP = dropColumnsOf(BATCH);
const batch = BATCHES[BATCH];

if (!(await tableExists(c, NOTICES_TABLE))) fatal(`原表 ${NOTICES_TABLE} 不存在（连错库？当前库=${process.env.DB_NAME}）`);
if (!batch) fatal(`未登记的批次 --batch=${BATCH}`);

const srcCols = await columnsOf(c, NOTICES_TABLE);
const srcNames = srcCols.map((x) => x.name);
const shadow = await tableExists(c, SHADOW_TABLE);
const srcIdx = await indexesOf(c, NOTICES_TABLE);

// ── A1 清单与现网一致 ────────────────────────────────────────────────────
const missingDrop = DROP.filter((x) => !srcNames.includes(x));
if (missingDrop.length) fatal(`A1 清单与现网漂移：待删列不存在 → ${missingDrop.join(", ")}`);
const missingGuard = Object.keys(GUARDED_COLUMNS).filter((x) => !srcNames.includes(x));
if (missingGuard.length) fatal(`A1 保护列缺失 → ${missingGuard.join(", ")}（禁止在此状态下精简）`);

// ── A2 读写点必须已清零 ──────────────────────────────────────────────────
const sites = findNoticeRefSites(process.cwd(), DROP, ["src", "scripts", "tests"], [
  "scripts/tools/notices-slim-plan.mjs",
  "scripts/tools/notices-slim-scan.mjs",
  "scripts/tools/lib/notices-ref-scan.mjs",
  "scripts/tools/notices-shadow-phase1.mjs",
  "scripts/tools/notices-shadow-phase2-cutover.mjs",
  "scripts/gates/check-notices-slim.mjs",
]);
if (sites.length) {
  fatal(
    `A2 批次 ${BATCH} 的列仍有本表读写点，先清障再跑阶段一：\n` +
      sites.map((s) => `  - ${s.col} → ${s.file} ×${s.count} ｜ ${s.sample.slice(0, 100)}`).join("\n"),
  );
}

// ── A3 待删列不得挂在索引上 ─────────────────────────────────────────────
const idxOnDrop = [...srcIdx.entries()].filter(([, i]) => i.cols.some((x) => DROP.includes(x.col)));
if (idxOnDrop.length) fatal(`A3 这些索引建在待删列上，本批不处理索引：${idxOnDrop.map(([n]) => n).join(", ")}`);

const fks = (
  await c.query(
    `SELECT CONCAT(TABLE_NAME,'.',COLUMN_NAME) ref, CONSTRAINT_NAME cst
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ?`,
    [NOTICES_TABLE],
  )
)[0];
const trgs = (
  await c.query(
    `SELECT TRIGGER_NAME n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ?`,
    [NOTICES_TABLE],
  )
)[0];
const totalRows = (await c.query(`SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\``))[0][0].n;
const size = (
  await c.query(
    `SELECT ROUND(DATA_LENGTH/1048576,1) dm, ROUND(INDEX_LENGTH/1048576,1) im
       FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [NOTICES_TABLE],
  )
)[0][0];
const isGenerated = (n) => srcCols.find((x) => x.name === n)?.extra.includes("GENERATED");
const writeCols = keptColumns(srcNames.filter((n) => !isGenerated(n)), BATCH);
const generatedKept = keptColumns(srcNames, BATCH).filter(isGenerated);
const ftLines = (await c.query(`SHOW CREATE TABLE \`${NOTICES_TABLE}\``))[0][0]["Create Table"]
  .split(/\r?\n/)
  .map((l) => l.trim().replace(/,$/, ""))
  .filter((l) => /^FULLTEXT KEY/.test(l));

console.log(`批次 ${BATCH} · ${batch.title}`);
console.log(`库 ${process.env.DB_NAME} · 表 ${NOTICES_TABLE}`);
console.log(`行数 ${totalRows} · 列 ${srcNames.length} → ${srcNames.length - DROP.length}（删 ${DROP.join(", ")}）· 索引 ${srcIdx.size}（本批不动）`);
console.log(`体积 data ${size.dm} MB + index ${size.im} MB ⇒ 影子表峰值约 ${size.dm} MB（先摘 FULLTEXT 再灌，索引 ${size.im} MB 后置重建）`);
console.log(`FULLTEXT 定义 ${ftLines.length} 条（灌完原样重建）：${ftLines.map((l) => l.match(/`(\w+)`/)[1]).join(", ")}`);
console.log(`生成列（不参与写入，切换后逐行比对定义）：${generatedKept.join(", ") || "无"}`);
console.log(fks.length ? `按名引用本表的外键：${fks.map((f) => `${f.ref}→${f.cst}`).join(", ")}` : "无外键引用本表 ✓");
console.log(trgs.length ? `⚠ 本表有触发器：${trgs.map((t) => t.n).join(", ")}（CREATE TABLE LIKE 不复制，需人工搬）` : "本表无触发器 ✓");
console.log(`读写点检查：${sites.length} 处（必须为 0）✓`);
console.log(`影子表 ${SHADOW_TABLE} ${shadow ? "已存在（需先 --rollback）" : "不存在"}`);

if (!BUILD && !ROLLBACK) {
  console.log("\n[--print-plan] 未写库。将执行的 DDL 与步骤：");
  console.log(`  1) CREATE TABLE \`${SHADOW_TABLE}\` LIKE \`${NOTICES_TABLE}\`;`);
  for (const l of ftLines) console.log(`  2) ALTER TABLE \`${SHADOW_TABLE}\` DROP INDEX ${l.match(/`(\w+)`/)[1]};   // ${l.slice(0, 70)}…`);
  console.log(`  3) ALTER TABLE \`${SHADOW_TABLE}\`\n     ${DROP.map((x) => `DROP COLUMN \`${x}\``).join(",\n     ")};`);
  console.log(`  4) 结构自检（列数/索引集合/生成列表达式/表排序规则）`);
  console.log(`  5) 分批回填：INSERT INTO \`${SHADOW_TABLE}\` (${writeCols.length} 列) SELECT ...，每批 ${BACKFILL_BATCH} 行，按主键窗口推进`);
  console.log(`  6) 重建 FULLTEXT：`);
  for (const l of ftLines) console.log(`       ALTER TABLE \`${SHADOW_TABLE}\` ADD ${l};`);
  console.log(`  7) 对账：按主键窗口 ${RECONCILE_SLICE} 行/片，逐片比行数 + 全列 CRC32 指纹（NULL 与空串可区分），另逐行比生成列`);
  console.log(`  8) AUTO_INCREMENT 抬升到不小于原表`);
  console.log("\n确认无误后加 --build 执行阶段一（原表不动）。批次清单与判据见 notices-slim-plan.mjs。");
  process.exit(0);
}

if (ROLLBACK) {
  if (!shadow) {
    console.log("影子表不存在，无需回滚。");
    process.exit(0);
  }
  await c.query(`DROP TABLE \`${SHADOW_TABLE}\``);
  console.log(`✅ 已 DROP \`${SHADOW_TABLE}\`；原表 \`${NOTICES_TABLE}\` 未受影响。`);
  process.exit(0);
}

if (shadow) fatal("A4 影子表已存在，先跑 --rollback 清干净再重建（不做静默覆盖）");

console.log("\n[1/7] CREATE TABLE LIKE");
await c.query(`CREATE TABLE \`${SHADOW_TABLE}\` LIKE \`${NOTICES_TABLE}\``);

console.log("[2/7] 先摘 FULLTEXT 索引（避免边灌边维护倒排）");
if (ftLines.length) {
  await c.query(`ALTER TABLE \`${SHADOW_TABLE}\` ${ftLines.map((l) => `DROP INDEX ${l.match(/`(\w+)`/)[1]}`).join(", ")}`);
}

console.log("[3/7] 影子表上删本批列");
await c.query(`ALTER TABLE \`${SHADOW_TABLE}\` ${DROP.map((x) => `DROP COLUMN \`${x}\``).join(", ")}`);

console.log("[4/7] 结构自检");
const newCols = (await columnsOf(c, SHADOW_TABLE)).map((x) => x.name);
const leaked = DROP.filter((x) => newCols.includes(x));
if (leaked.length) fatal(`删列未生效：${leaked.join(", ")}`);
const genExprOf = async (t) =>
  (
    await c.query(
      `SELECT GENERATION_EXPRESSION e FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND EXTRA LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION`,
      [t],
    )
  )[0].map((r) => String(r.e).replace(/\s+/g, ""));
const [genSrc, genNew] = [await genExprOf(NOTICES_TABLE), await genExprOf(SHADOW_TABLE)];
if (JSON.stringify(genSrc) !== JSON.stringify(genNew)) fatal(`生成列表达式漂移：${JSON.stringify(genSrc)} vs ${JSON.stringify(genNew)}`);
const collOf = async (t) =>
  (await c.query(`SELECT TABLE_COLLATION c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [t]))[0][0].c;
const [srcColl, newColl] = [await collOf(NOTICES_TABLE), await collOf(SHADOW_TABLE)];
if (srcColl !== newColl) fatal(`排序规则漂移：${srcColl} → ${newColl}`);
console.log(`  列 ${newCols.length} · 生成列表达式一致 · 排序规则 ${newColl}`);

console.log(`[5/7] 分批回填（${BACKFILL_BATCH} 行/批）`);
const colList = writeCols.map((x) => `\`${x}\``).join(", ");
let lastId = 0;
let moved = 0;
const bar = makeProgress(totalRows, "回填");
for (;;) {
  const res = await c.query(
    `INSERT INTO \`${SHADOW_TABLE}\` (${colList})
     SELECT ${colList} FROM \`${NOTICES_TABLE}\` WHERE \`id\` > ? ORDER BY \`id\` LIMIT ${BACKFILL_BATCH}`,
    [lastId],
  );
  moved += res[0].affectedRows;
  const peek = (
    await c.query(`SELECT MAX(id) mx FROM (SELECT \`id\` FROM \`${NOTICES_TABLE}\` WHERE \`id\` > ${lastId} ORDER BY \`id\` LIMIT ${BACKFILL_BATCH}) t`)
  )[0][0];
  if (peek.mx == null) break;
  lastId = Number(peek.mx);
  bar(moved);
}
process.stdout.write("\n");
console.log(`  累计写入 ${moved} 行`);

console.log(`[6/7] 重建 FULLTEXT 索引（${ftLines.length} 个，本步最耗时）`);
for (const l of ftLines) {
  const t0 = Date.now();
  await c.query(`ALTER TABLE \`${SHADOW_TABLE}\` ADD ${l}`);
  console.log(`  + ${l.match(/`(\w+)`/)[1]}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
}

console.log("[7/7] 对账校验（行数 + 逐片列指纹 + 生成列逐行比对 + 索引集合）");
const shadowTotal = (await c.query(`SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\``))[0][0].n;
if (shadowTotal !== Number(totalRows)) fatal(`行数不等：原表 ${totalRows} vs 影子表 ${shadowTotal}`);
const slices = await reconcile(c, NOTICES_TABLE, SHADOW_TABLE, writeCols, RECONCILE_SLICE, "对账");
for (const g of generatedKept) {
  const bad = (
    await c.query(
      `SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\` o JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id WHERE NOT (o.\`${g}\` <=> s.\`${g}\`)`,
    )
  )[0][0].n;
  if (Number(bad) !== 0) fatal(`生成列 ${g} 逐行不等 ${bad} 行`);
}
const newIdx = await indexesOf(c, SHADOW_TABLE);
// A3 已保证待删列不挂任何索引，所以两表索引集应逐个同名
const srcIdxNames = [...srcIdx.keys()].sort();
const newIdxNames = [...newIdx.keys()].sort();
if (JSON.stringify(srcIdxNames) !== JSON.stringify(newIdxNames)) {
  fatal(`索引集合不等：原表 ${srcIdxNames.join(",")} vs 影子表 ${newIdxNames.join(",")}（FULLTEXT 重建可能有名字漂移）`);
}
const aiOf = async (t) =>
  Number((await c.query(`SELECT AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [t]))[0][0].ai ?? 0);
const [aiSrc, aiNew] = [await aiOf(NOTICES_TABLE), await aiOf(SHADOW_TABLE)];
if (aiNew < aiSrc) {
  await c.query(`ALTER TABLE \`${SHADOW_TABLE}\` AUTO_INCREMENT = ${aiSrc}`);
  console.log(`  AUTO_INCREMENT 已抬升至 ${aiSrc}`);
}
console.log(`  ${slices} 片对账全一致 · 索引 ${newIdxNames.length} 个与原表同名同集 · 生成列逐行一致`);

console.log(`\n✅ 阶段一完成：\`${SHADOW_TABLE}\` 已就位（${shadowTotal} 行）`);
console.log(`原表 \`${NOTICES_TABLE}\` **未被触碰**，生产读路径仍走原表。`);
console.log("\n下一步（须人工确认后进行，见阶段二脚本）：");
console.log("  1) 冻结外部同步：停应用内 crawler-sync（SYNC_WORKER_IN_APP / 停 pm2 应用），或确认够不到源库已自动 skip");
console.log(`  2) node --env-file=.env scripts/tools/notices-shadow-phase2-cutover.mjs --batch=${BATCH} --diff      # 只看回填后新增/变更的行`);
console.log(`  3) node --env-file=.env scripts/tools/notices-shadow-phase2-cutover.mjs --batch=${BATCH} --cutover --frozen`);
console.log("  4) 稳定后人工 DROP 旧表位，并用 scripts/tools/dump-schema-baseline.mjs 重导 baseline.sql");
await c.end();
