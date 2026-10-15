/**
 * crm_bid_notices 影子表精简 · 阶段二（补增量 + 原子切换 + 可反切）
 *
 * 纪律见 docs/adr/0003-shadow-table-blue-green-migration.md 阶段二条：
 *   冻结外部同步 → 补增量 → 全表对账 → 原子 RENAME（保留旧表位）→ 解冻同步。
 *   本表由 crawler-sync（应用内，默认 1h 一轮）与 daily-sync（站外应急兜底）实时写入，
 *   **未冻结就切换会丢写**。
 *
 * 与兄弟表脚本的一处关键差别：本表的应用侧写入（featured 刷新写 is_featured、
 * RFQ submit 写 rfq_status/published_date）**不推进 update_time**，只按 update_time
 * 找差异会漏掉这些行 —— 所以差异检测除了水位列，还要比 APP_WRITABLE_COLUMNS。
 *
 * 用法：
 *   node --env-file=.env scripts/tools/notices-shadow-phase2-cutover.mjs --diff                 # 只读：看回填之后原表又新增/变更/删除了多少行
 *   node --env-file=.env scripts/tools/notices-shadow-phase2-cutover.mjs --cutover --frozen     # 补增量 + 对账 + 原子 RENAME
 *   node --env-file=.env scripts/tools/notices-shadow-phase2-cutover.mjs --rollback             # 反切：旧表位回到原表名
 *   加 --batch=N 与阶段一同批次（默认 1）；--prune 让切换前把原表已删的行从影子表同步删掉
 *
 * ⚠️ 库归属：`.env` 的 127.0.0.1:3307 是**云生产库**的 SSH 隧道本地端口（docs/adr/0012）。
 *   --cutover 的 RENAME 是秒级原子换表，但直接作用在现网上：先低峰窗口、先冻结同步。
 */
import {
  NOTICES_TABLE, SHADOW_TABLE, OLD_TABLE_PREFIX, APP_WRITABLE_COLUMNS, BATCHES,
  dropColumnsOf, keptColumns,
} from "./notices-slim-plan.mjs";
import { conn, fatal, columnsOf, indexesOf, tableExists, reconcile, activeWritersOn } from "./lib/notices-slim-common.mjs";

const DIFF = process.argv.includes("--diff");
const CUTOVER = process.argv.includes("--cutover");
const ROLLBACK = process.argv.includes("--rollback");
const FROZEN = process.argv.includes("--frozen");
const PRUNE = process.argv.includes("--prune");
const BATCH = Number((process.argv.find((a) => a.startsWith("--batch=")) ?? "").split("=")[1] ?? 1);
const RECONCILE_SLICE = 2000;
if (!BATCHES[BATCH]) fatal(`未登记的批次 --batch=${BATCH}`);
// 与阶段一同款守卫：空列集批次（已并入其他批次）不该占用一个冻结同步的切换窗口。
if (!dropColumnsOf(BATCH).length) fatal(`批次 ${BATCH} 无可删列（${BATCHES[BATCH].title}），不得占用切换窗口`);

const c = await conn();
const srcCols = await columnsOf(c, NOTICES_TABLE);
const srcNames = srcCols.map((x) => x.name);
const isGenerated = (n) => srcCols.find((x) => x.name === n)?.extra.includes("GENERATED");
const writeCols = keptColumns(srcNames.filter((n) => !isGenerated(n)), BATCH);
const colList = writeCols.map((x) => `\`${x}\``).join(", ");
const updateClause = writeCols.map((x) => `\`${x}\` = VALUES(\`${x}\`)`).join(", ");

if (!(await tableExists(c, SHADOW_TABLE))) fatal(`影子表 ${SHADOW_TABLE} 不存在，请先跑阶段一`);

// 影子表名字不唯一：2026-10-15 实测到并行作业也在建同名 `crm_bid_notices__new`。
// 对别人正在回填的影子表做 --diff 会得到假结论，做 --cutover 会把别人的半成品推上生产，
// --rollback 会跟对方抢名字。故三种动作前先查谁在写。
{
  const writers = await activeWritersOn(c, SHADOW_TABLE);
  if (writers.length) {
    fatal(
      `影子表 ${SHADOW_TABLE} 上有其他会话正在执行（${writers.length} 条），本脚本不得对它做任何动作：\n` +
        writers.map((w) => `  - id=${w.ID} ${w.USER}@${w.HOST} ${w.TIME}s [${w.STATE}] ${String(w.info).replace(/\s+/g, " ")}`).join("\n") +
        `\n先核对归属（它可能属于另一个精简批次），确认它已停写后才能继续。`,
    );
  }
}

/**
 * 行级差异：新增行 + 内容变更行（按水位列**或**应用侧可写列判定）+ 影子表多出的行（原表已删）。
 * 应用侧可写列必须一起比：is_featured / rfq_status 等变更不推进 update_time，
 * 只比水位会把精选位的真实改动当成「无差异」而丢掉。
 */
async function diffStats() {
  const appCmp = APP_WRITABLE_COLUMNS.filter((x) => writeCols.includes(x))
    .map((x) => `OR NOT (o.\`${x}\` <=> s.\`${x}\`)`)
    .join(" ");
  const changed = (
    await c.query(
      `SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\` o
         LEFT JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id
        WHERE s.id IS NULL OR NOT (o.\`update_time\` <=> s.\`update_time\`) ${appCmp}`,
    )
  )[0][0].n;
  const orphan = (
    await c.query(
      `SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\` s
        WHERE NOT EXISTS (SELECT 1 FROM \`${NOTICES_TABLE}\` o WHERE o.id = s.id)`,
    )
  )[0][0].n;
  return { pending: Number(changed), orphan: Number(orphan) };
}

if (DIFF) {
  const d = await diffStats();
  console.log(`批次 ${BATCH} · 待补增量（新增 / update_time 或应用侧可写列变更）：${d.pending} 行`);
  console.log(`影子表多出的行（原表已删）：${d.orphan} 行${d.orphan ? " → 切换前需 --prune 同步删除，否则会把已删行带回生产" : ""}`);
  console.log(d.pending === 0 && d.orphan === 0 ? "✅ 两表当前等价，可择窗切换。" : "⚠️ 存在差异：--cutover 会自动补增量（删除行只在带 --prune 时处理）。");
  process.exit(0);
}

if (ROLLBACK) {
  const olds = (
    await c.query(
      `SELECT TABLE_NAME t FROM information_schema.TABLES
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE ?`,
      [`${OLD_TABLE_PREFIX}%`],
    )
  )[0].map((r) => r.t);
  if (!olds.length) fatal(`找不到旧表位 ${OLD_TABLE_PREFIX}*，无法反切`);
  if (olds.length > 1) fatal(`找到多个旧表位（${olds.join(", ")}），请人工指定后再反切`);
  const [oldTable] = olds;
  if (await tableExists(c, SHADOW_TABLE)) fatal(`${SHADOW_TABLE} 仍存在：反切前先确认阶段一/二状态（避免名字撞车）`);
  await c.query(`RENAME TABLE \`${NOTICES_TABLE}\` TO \`${SHADOW_TABLE}\`, \`${oldTable}\` TO \`${NOTICES_TABLE}\``);
  console.log(`✅ 已反切：${oldTable} → ${NOTICES_TABLE}；切换后的精简表留在 ${SHADOW_TABLE}（可继续观察或人工 DROP）。`);
  console.log("别忘了重新解冻 crawler-sync / daily-sync。");
  process.exit(0);
}

// ── 切换 ────────────────────────────────────────────────────────────────
if (!CUTOVER) fatal(`未指定动作：--diff | --cutover --frozen | --rollback`);
if (!FROZEN) fatal("必须带 --frozen：切换窗口内外部同步（crawler-sync / daily-sync）未冻结会丢写，见 ADR-0003「外部实时写表」条");

console.log("[1/5] 补增量（按 id 分批幂等 upsert，多灌无害）");
let guard = 0;
for (;;) {
  const appCmp = APP_WRITABLE_COLUMNS.filter((x) => writeCols.includes(x))
    .map((x) => `OR NOT (o.\`${x}\` <=> s.\`${x}\`)`)
    .join(" ");
  const batch = (
    await c.query(
      `SELECT o.id FROM \`${NOTICES_TABLE}\` o
         LEFT JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id
        WHERE s.id IS NULL OR NOT (o.\`update_time\` <=> s.\`update_time\`) ${appCmp}
        ORDER BY o.id LIMIT ${5000}`,
    )
  )[0];
  if (!batch.length) break;
  const ids = batch.map((r) => Number(r.id)).join(", ");
  await c.query(
    `INSERT INTO \`${SHADOW_TABLE}\` (${colList})
     SELECT ${colList} FROM \`${NOTICES_TABLE}\` WHERE \`id\` IN (${ids})
     ON DUPLICATE KEY UPDATE ${updateClause}`,
  );
  console.log(`  已补 ${batch.length} 行（id ≤ ${Math.max(...batch.map((r) => Number(r.id)))}）`);
  if (++guard > 50) fatal("补增量循环超过 50 轮仍未收敛，疑似同步未冻结（原表正在被写）→ 停线人工确认");
}

if (PRUNE) {
  const del = await c.query(
    `DELETE s FROM \`${SHADOW_TABLE}\` s
      WHERE NOT EXISTS (SELECT 1 FROM \`${NOTICES_TABLE}\` o WHERE o.id = s.id)`,
  );
  console.log(`  --prune：已从影子表删除原表不存在的行 ${del[0].affectedRows} 条`);
}

console.log("[2/5] 切换前全表对账");
const slices = await reconcile(c, NOTICES_TABLE, SHADOW_TABLE, writeCols, RECONCILE_SLICE, "对账");
const d = await diffStats();
if (d.pending) fatal(`仍有 ${d.pending} 行差异未消除，禁止切换`);
if (d.orphan) fatal(`影子表仍多出 ${d.orphan} 行（原表已删）→ 带 --prune 重跑，或人工判断`);
console.log(`  ${slices} 片列指纹逐片一致 · 差异 0 · 多余行 0`);

console.log("[3/5] 原子 RENAME（秒级，单语句内完成两步改名）");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const oldTable = `${OLD_TABLE_PREFIX}${stamp}`;
if (await tableExists(c, oldTable)) fatal(`旧表位 ${oldTable} 已存在，请先人工处置（改名或清理）再切换`);
await c.query(`RENAME TABLE \`${NOTICES_TABLE}\` TO \`${oldTable}\`, \`${SHADOW_TABLE}\` TO \`${NOTICES_TABLE}\``);
console.log(`  ${NOTICES_TABLE} ⇐ 精简表；原表保留为 ${oldTable}`);

console.log("[4/5] 切换后自检（结构 + 行数 + 读路径 + 全文降级检索）");
const afterCols = (await columnsOf(c, NOTICES_TABLE)).map((x) => x.name);
const leaked = dropColumnsOf(BATCH).filter((x) => afterCols.includes(x));
if (leaked.length) fatal(`切换后仍可看到待删列：${leaked.join(", ")}`);
const rowsAfter = (await c.query(`SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\``))[0][0].n;
const oldRows = (await c.query(`SELECT COUNT(*) n FROM \`${oldTable}\``))[0][0].n;
if (Number(rowsAfter) !== Number(oldRows)) fatal(`切换后行数 ${rowsAfter} ≠ 旧表 ${oldRows}`);
const idxAfter = await indexesOf(c, NOTICES_TABLE);
const ftAfter = [...idxAfter.values()].filter((i) => i.type === "FULLTEXT").map((i) => i.name);
if (ftAfter.length !== 3) fatal(`FULLTEXT 索引不全（现 ${ftAfter.join(",")}），降级全文检索会坏`);
// 真实读路径各跑一次：有效性口径 + 精选谓词 + 三种 MATCH 签名（列集合与索引必须逐一对得上）
const probes = [
  ["有效性计数", `SELECT COUNT(*) n FROM \`${NOTICES_TABLE}\` n WHERE (n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND (n.entry_source <> 'platform' OR IFNULL(n.rfq_status,'') = 'published')`],
  ["MATCH(title,reference,description)", `SELECT id FROM \`${NOTICES_TABLE}\` n2 WHERE MATCH(n2.title, n2.reference, n2.description) AGAINST('solar' IN BOOLEAN MODE) LIMIT 1`],
  ["MATCH(title,reference)", `SELECT id FROM \`${NOTICES_TABLE}\` n2 WHERE MATCH(n2.title, n2.reference) AGAINST('solar' IN BOOLEAN MODE) LIMIT 1`],
  ["MATCH(description)", `SELECT id FROM \`${NOTICES_TABLE}\` n2 WHERE MATCH(n2.description) AGAINST('solar' IN BOOLEAN MODE) LIMIT 1`],
];
for (const [name, sql] of probes) {
  try {
    await c.query(sql);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fatal(`读路径自检失败：${name} → ${e.code ?? ""} ${e.sqlMessage ?? e.message}`);
  }
}
console.log(`  现网 ${NOTICES_TABLE}：${afterCols.length} 列 / ${rowsAfter} 行 · 索引 ${idxAfter.size}（FULLTEXT ${ftAfter.length}）· 旧表位 ${oldRows} 行`);

console.log("[5/5] 收尾提示");
console.log("  1) 解冻外部同步（重启 crawler-sync 或置回 SYNC_WORKER_IN_APP）；");
console.log("     同步是「源∩目标」交集写列，被删的列会自动跳过并打告警（daily-sync.cjs 交集语义），不报错");
console.log(`  2) 观察稳定后人工 DROP 旧表位（它是切换后的唯一反滚物，也是本轮的数据留底）：${oldTable}`);
console.log("  3) 重导结构基线：node --env-file=.env scripts/tools/dump-schema-baseline.mjs");
console.log("  4) 回滚窗口内如需反切：本脚本 --rollback");
await c.end();
