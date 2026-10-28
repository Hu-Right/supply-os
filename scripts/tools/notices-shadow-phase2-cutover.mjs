/**
 * bid_notices 影子表精简 · 阶段二（补增量 + 原子切换 + 可反切）
 *
 * 纪律见 docs/adr/0003-shadow-table-blue-green-migration.md 阶段二条：
 *   冻结外部同步 → 补增量 → 全表对账 → 原子 RENAME（保留旧表位）→ 解冻同步。
 *   本表由 crawler-sync（应用内，默认 1h 一轮）与 daily-sync（站外应急兜底）实时写入，
 *   **未冻结就切换会丢写**。
 *
 * 与兄弟表脚本的一处关键差别（2026-10-15 实测修正）：本表存在**不推进 update_time 的列改写**。
 * 当时 `documents` 被外部管道写了 194 行，而 `update_time` 纹丝不动、`documents` 也不在
 * 「应用侧可写列」清单里 ⇒ 旧版差异检测报「待补增量 0 行」，而阶段一的逐片指纹对账把它拉了下来。
 * 所以本脚本的补增量与切换前闸**改成按全列行指纹驱动**（与阶段一对账同一判据），
 * APP_WRITABLE_COLUMNS 只保留作「哪个列竞写了」的诊断参考，不再当完备性断言用。
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
  dropColumnsOf, keptColumns, indexPlanOf,
} from "./notices-slim-plan.mjs";
import { conn, fatal, columnsOf, indexesOf, tableExists, reconcile, activeWritersOn, findDirtyRows } from "./lib/notices-slim-common.mjs";

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
 * 两表差异：按**全列行指纹**逐片下钻拾出不一致行（新增行 + 内容变更行），另拾影子表多出的行（原表已删）。
 * 不拿「水位列 + 应用侧可写列」当判据：那份清单是手维护的，遗漏一个静默改写的列就会把真差异好成 0（实测踩过）。
 */
async function diffStats(label = "差异扫描") {
  const dirty = await findDirtyRows(c, NOTICES_TABLE, SHADOW_TABLE, writeCols, RECONCILE_SLICE, label);
  const orphan = (
    await c.query(
      `SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\` s
        WHERE NOT EXISTS (SELECT 1 FROM \`${NOTICES_TABLE}\` o WHERE o.id = s.id)`,
    )
  )[0][0].n;
  return { pending: dirty.ids.length, ids: dirty.ids, colCounts: dirty.colCounts, missing: dirty.missing, orphan: Number(orphan) };
}

/** 把差异按列拆出来念给人看；竞写列不在应用侧可写清单里时要单独提醒。 */
function reportCols(d) {
  const entries = Object.entries(d.colCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length) console.log(`  差异列分解：${entries.map(([k, v]) => `${k}×${v}`).join(", ")}${d.missing ? ` · 影子表缺行 ${d.missing}` : ""}`);
  const surprise = entries.map(([k]) => k).filter((k) => k !== "update_time" && !APP_WRITABLE_COLUMNS.includes(k));
  if (surprise.length) {
    console.log(`  ⚠ 这些列改了却不推水位、也不在 APP_WRITABLE_COLUMNS：${surprise.join(", ")} ⇒ 按全列指纹补写才能接住（本脚本已是）。`);
  }
}

if (DIFF) {
  const d = await diffStats("差异扫描");
  console.log(`批次 ${BATCH} · 待补增量（按全部保留列的行指纹判定）：${d.pending} 行`);
  reportCols(d);
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

console.log("[1/5] 补增量（按全列行指纹逐片找脏行 → 分批幂等 upsert，多灌无害）");
const UPSERT_CHUNK = 1000; // 单条 IN 拼 645k 行会撞 max_allowed_packet，也会把事务撑大
const seenCols = {};
let guard = 0;
for (;;) {
  const dirty = await findDirtyRows(c, NOTICES_TABLE, SHADOW_TABLE, writeCols, RECONCILE_SLICE, `第 ${guard + 1} 轮扫描`);
  for (const [k, v] of Object.entries(dirty.colCounts)) seenCols[k] = (seenCols[k] ?? 0) + v;
  if (!dirty.ids.length) {
    reportCols({ colCounts: seenCols, missing: 0 });
    console.log(guard ? `  已收敛（共 ${guard} 轮补写）` : "  首扫即无差异");
    break;
  }
  for (let i = 0; i < dirty.ids.length; i += UPSERT_CHUNK) {
    const ids = dirty.ids.slice(i, i + UPSERT_CHUNK).join(", ");
    await c.query(
      `INSERT INTO \`${SHADOW_TABLE}\` (${colList})
       SELECT ${colList} FROM \`${NOTICES_TABLE}\` WHERE \`id\` IN (${ids})
       ON DUPLICATE KEY UPDATE ${updateClause}`,
    );
  }
  guard++;
  console.log(`  第 ${guard} 轮拾出并补写 ${dirty.ids.length} 行（id ≤ ${Math.max(...dirty.ids)}）`);
  // 上限压低：这里每轮都是全库一遍指纹，转圈多不是「再试就能过」，而是同步未冻结的确诊单
  if (guard > 6) fatal("补增量 6 轮仍未收敛 ⇒ 原表正在被持续写入（同步未冻结）→ 停线人工确认，禁止切换");
}

if (PRUNE) {
  const del = await c.query(
    `DELETE s FROM \`${SHADOW_TABLE}\` s
      WHERE NOT EXISTS (SELECT 1 FROM \`${NOTICES_TABLE}\` o WHERE o.id = s.id)`,
  );
  console.log(`  --prune：已从影子表删除原表不存在的行 ${del[0].affectedRows} 条`);
}

console.log("[2/5] 切换前全表对账（逐片行数+列指纹，不一致即抛错带定位）");
const slices = await reconcile(c, NOTICES_TABLE, SHADOW_TABLE, writeCols, RECONCILE_SLICE, "对账");
// 内容已由 reconcile 逐片签过，这里只补一条「影子表多行」（reconcile 按原表窗口走，拾不到多出来的行）
const orphan = Number(
  (
    await c.query(
      `SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\` s WHERE NOT EXISTS (SELECT 1 FROM \`${NOTICES_TABLE}\` o WHERE o.id = s.id)`,
    )
  )[0][0].n,
);
if (orphan) fatal(`影子表仍多出 ${orphan} 行（原表已删）→ 带 --prune 重跑，或人工判断`);
console.log(`  ${slices} 片列指纹逐片一致 · 多余行 0`);

console.log("[3/5] 原子 RENAME（秒级，单语句内完成两步改名）");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const oldTable = `${OLD_TABLE_PREFIX}${stamp}`;
if (await tableExists(c, oldTable)) {
  fatal(
    `旧表位 ${oldTable} 已存在（上一批次留下的），直接改名会踩掉它的反滚能力。\n` +
      `  请按本仓约定把它改名为不匹配 ${OLD_TABLE_PREFIX}% 的名字（例：${NOTICES_TABLE}_retired_<批次>_${stamp}）：\n` +
      `    · 这样本批的 --rollback 才不会因找到多个旧表位而歧义；\n` +
      `    · 且 dump-schema-baseline 的 /_retired_/ 排除规则已覆盖它，不会混进基线。\n` +
      `  确认无需再反滚上一批时，才轮得到人工 DROP 它。`,
  );
}
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
// 索引连带处置的现网复核（批次二这类删带索引的列必须验）：退役的要真没了，
// 重建的必须是登记的那几列——光看名字会过，而列集错一个就是另一种查询能力。
{
  const plan = indexPlanOf(BATCH);
  const stillThere = plan.drop.filter((n) => idxAfter.has(n) && !plan.add.some((a) => a.name === n));
  if (stillThere.length) fatal(`这些索引本批应已退役但切换后仍在场：${stillThere.join(", ")}`);
  for (const a of plan.add) {
    const got = (idxAfter.get(a.name)?.cols ?? []).map((x) => x.col);
    if (JSON.stringify(got) !== JSON.stringify(a.cols)) {
      fatal(`切换后索引 ${a.name} 列集不符：期望 (${a.cols.join(",")}) 实得 (${got.join(",")})`);
    }
    console.log(`  ✓ 索引 ${a.name} (${got.join(",")})`);
  }
}
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
