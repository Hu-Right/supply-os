/**
 * probe275 · 影子表切换后的现网复核（只读，任意一批落库后都可复跑）
 *
 * 由 temp/probe275 归档而来（2026-10-15 批次四落库当轮实测）。要回答的三件事都直接关系
 * 「切换有没有把好数据换成旧数据」，而且每一件都是这轮真踩过的：
 *   ① 待删列真的从现网消失、而旧表位里还在吗（反滚物完整性）；
 *   ② 不推进 `update_time` 的静默列改写有没有被补上（docs/adr/0003「能力边界」第 1 条）
 *      —— 判据：现网 vs 本批旧表位逐行比 `documents` 必须 0 行不一致，另比「真有内容的行数」
 *        在现网 / 本批旧位 / 上一批旧位上的分布，确认补上来的行没被 NULL 覆盖掉；
 *   ③ 上一批重建的单列索引仍被 EXPLAIN 选中（切换后读能力没退化）。
 *
 * 结论同时落 runtime/p275.json：PowerShell 中文控制台会吃字，以文件为准。
 * 待删列**不写硬编码字面量**：从清单 `dropColumnsOf(--batch=N)` 取（同一事实源），
 * 否则探针自己就成了门禁要扫的「提及退役列名的跟踪文件」。
 * 用法：node --env-file=.env scripts/forensics/probe275-post-cutover-check.mjs [--batch=4] [--stamp=20261015] [--prev=<上一批旧表名>]
 */
import { writeFileSync } from "node:fs";
import { conn, columnsOf, tableExists } from "../../scripts/tools/lib/notices-slim-common.mjs";
import { NOTICES_TABLE, OLD_TABLE_PREFIX, dropColumnsOf } from "../../scripts/tools/notices-slim-plan.mjs";

const arg = (name, dft) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? dft;
const BATCH = Number(arg("batch", "4"));
const STAMP = arg("stamp", "20261015");
// 三张表的口径来自 docs/adr/0003 的命名约定：本批旧位用 __old_，更早批次让位改名成 _retired_
const LIVE = NOTICES_TABLE;
const OLD_THIS_BATCH = `${OLD_TABLE_PREFIX}${STAMP}`;
const OLD_PREV_BATCH = arg("prev", `${NOTICES_TABLE}_retired_b2_${STAMP}`);
// 本批待删列：现网必须已无、旧表位必须仍在（反滚物完整性）
const DROPPED_COLS = dropColumnsOf(BATCH);
const OUT = "runtime/p275.json";

const c = await conn();
const report = { at: new Date().toISOString(), tables: [], checks: [] };

// ① 场内本表系列盘点：列数 + 精确行数（不用 TABLE_ROWS，那是估算，偏差实测可达 40%）
const [rows] = await c.query(
  `SELECT TABLE_NAME t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'crm_bid_notices%' ORDER BY TABLE_NAME`,
);
for (const r of rows) {
  const cols = await columnsOf(c, r.t);
  const [[{ n }]] = await c.query(`SELECT COUNT(*) n FROM \`${r.t}\``);
  report.tables.push({ table: r.t, cols: cols.length, rows: Number(n), droppedColsPresent: DROPPED_COLS.filter((x) => cols.some((y) => y.name === x)) });
}

// ② documents 逐行比对：现网 vs 本批旧位（这两张才是「切换前后」的直接对照）
for (const other of [OLD_THIS_BATCH, OLD_PREV_BATCH]) {
  if (!(await tableExists(c, other))) {
    report.checks.push({ check: `documents vs ${other}`, skipped: "表不在场" });
    continue;
  }
  const [[{ diff }]] = await c.query(
    `SELECT COUNT(*) diff FROM \`${LIVE}\` s JOIN \`${other}\` o ON o.id = s.id WHERE NOT (s.documents <=> o.documents)`,
  );
  // 真有内容行数（排除 NULL / '[]' / JSON 空对象）
  const [[{ liveN }]] = await c.query(`SELECT COUNT(*) liveN FROM \`${LIVE}\` WHERE documents IS NOT NULL AND JSON_LENGTH(documents) > 0`);
  const [[{ otherN }]] = await c.query(`SELECT COUNT(*) otherN FROM \`${other}\` WHERE documents IS NOT NULL AND JSON_LENGTH(documents) > 0`);
  report.checks.push({ check: `documents vs ${other}`, diffRows: Number(diff), liveHasContent: Number(liveN), otherHasContent: Number(otherN) });
}

// ③ 单列索引仍被选中
const [explain] = await c.query(`EXPLAIN SELECT id FROM \`${LIVE}\` WHERE converted_opp_id = 42`);
report.checks.push({ check: "EXPLAIN converted_opp_id", key: explain[0].key, type: explain[0].type });

// ④ 索引形状与 FULLTEXT 现网实态（本表带 3 个 FULLTEXT ⇒ 只能影子表，见清单头注）
const [idx] = await c.query(
  `SELECT INDEX_NAME nm, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols, INDEX_TYPE ty
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?
     GROUP BY INDEX_NAME, INDEX_TYPE ORDER BY INDEX_NAME`,
  [LIVE],
);
report.indexes = idx.map((x) => ({ name: x.nm, cols: x.cols, type: x.ty }));
report.fulltext = idx.filter((x) => x.ty === "FULLTEXT").length;

// ⑤ 生成列没漂（有效性唯一权威口径）
const [gen] = await c.query(
  `SELECT COLUMN_NAME nm, GENERATION_EXPRESSION e FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND EXTRA LIKE '%GENERATED%'`,
  [LIVE],
);
report.generated = gen.map((x) => ({ col: x.nm, expr: String(x.e).replace(/\s+/g, " ") }));

writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
const doc = report.checks.filter((x) => String(x.check).startsWith("documents"));
console.log(`tables=${report.tables.length} docDiffs=${doc.map((x) => x.diffRows).join("/")} fulltext=${report.fulltext} indexes=${report.indexes.length} -> ${OUT}`);
for (const t of report.tables) console.log(`  ${t.table}: ${t.cols} cols / ${t.rows} rows / droppedColsStillPresent=[${t.droppedColsPresent.join(",")}]`);
// 形状断言：现网不得还有本批待删列，本批旧位必须还有（否则反滚物不完整）
const live = report.tables.find((t) => t.table === LIVE);
const oldHere = report.tables.find((t) => t.table === OLD_THIS_BATCH);
if (live && live.droppedColsPresent.length) console.log(`❌ 现网仍能看到本批待删列：[${live.droppedColsPresent.join(",")}]`);
if (oldHere && oldHere.droppedColsPresent.length !== DROPPED_COLS.length) console.log(`❌ 旧表位缺待删列（反滚物存疑）：只看到 [${oldHere.droppedColsPresent.join(",")}]`);
await c.end();
