/**
 * bid_opportunities 影子表精简 · 阶段二（补增量 + 原子切换 + 可反切）
 *
 * 纪律见 docs/adr/0003-shadow-table-blue-green-migration.md 阶段二条：
 *   冻结外部同步 → 补增量 → 全表对账 → 原子 RENAME（保留旧表位）→ 解冻同步。
 *   本表由内网 daily-sync / crawler-sync 实时写入，**未冻结就切换会丢写**。
 *
 * 用法：
 *   node --env-file=.env scripts/tools/opp-shadow-phase2-cutover.mjs --diff     # 只读：看回填之后原表又新增/变更/删除了多少行
 *   node --env-file=.env scripts/tools/opp-shadow-phase2-cutover.mjs --cutover --frozen
 *                                                                              # 补增量 + 对账 + 原子 RENAME（必须显式声明已冻结同步）
 *   node --env-file=.env scripts/tools/opp-shadow-phase2-cutover.mjs --rollback # 反切：旧表位回到原表名
 *
 * ⚠️ 库归属：`.env` 的 127.0.0.1:3307 是 **云生产库** 的 SSH 隧道本地端口（口径同 docs/adr/0012），
 *   --cutover 的 RENAME 是秒级原子换表，但直接作用在现网上：先低峰窗口、先冻结同步、先确认已留旧表位。
 */
import mysql from "mysql2/promise";
import {
  OPP_TABLE, SHADOW_TABLE, OLD_TABLE_PREFIX, keptColumns, BACKFILL_BATCH,
} from "./opp-slim-plan.mjs";

const DIFF = process.argv.includes("--diff");
const CUTOVER = process.argv.includes("--cutover");
const ROLLBACK = process.argv.includes("--rollback");
const FROZEN = process.argv.includes("--frozen");

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
const exists = async (t) =>
  !!(await q(`SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${t}'`))[0].n;

const srcCols = (await q(
  `SELECT COLUMN_NAME name, UPPER(EXTRA) extra FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${OPP_TABLE}' ORDER BY ORDINAL_POSITION`,
));
const writeCols = keptColumns(srcCols.filter((c) => !c.extra.includes("GENERATED")).map((c) => c.name));
const colList = writeCols.map((c) => `\`${c}\``).join(", ");
const updateClause = writeCols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
const term = (c) => `IF(\`${c}\` IS NULL, CHAR(1 USING utf8mb4), CONCAT(CHAR(2 USING utf8mb4), IFNULL(CAST(\`${c}\` AS CHAR), '')))`;
const fpExpr = `SUM(CRC32(CONCAT(${writeCols.map(term).join(", ")})))`;

/** 原表与影子表的行级差异（新增/变更按 update_time 粗筛，删除单独计数） */
async function diffStats() {
  const changed = await q(
    `SELECT COUNT(*) n FROM \`${OPP_TABLE}\` o
       LEFT JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id
      WHERE s.id IS NULL OR NOT (o.\`update_time\` <=> s.\`update_time\`)`,
  );
  const orphan = await q(
    `SELECT COUNT(*) n FROM \`${SHADOW_TABLE}\` s
      WHERE NOT EXISTS (SELECT 1 FROM \`${OPP_TABLE}\` o WHERE o.id = s.id)`,
  );
  return { pending: Number(changed[0].n), orphan: Number(orphan[0].n) };
}

/** 全表分片对账：行数与列指纹必须逐片相等 */
async function reconcile() {
  const { lo, hi } = (await q(`SELECT MIN(id) lo, MAX(id) hi FROM \`${OPP_TABLE}\``))[0];
  const a = Number(lo ?? 0);
  const b = Number(hi ?? 0);
  let slices = 0;
  for (let x = a; x <= b; x += 5000) {
    const y = x + 4999;
    const sql = (t) => `SELECT COUNT(*) n, ${fpExpr} fp FROM \`${t}\` WHERE \`id\` BETWEEN ${x} AND ${y}`;
    const [l, r] = [await q(sql(OPP_TABLE)), await q(sql(SHADOW_TABLE))];
    slices++;
    if (l[0].n !== r[0].n || String(l[0].fp) !== String(r[0].fp)) {
      fatal(`对账不一致：id ∈ [${x},${y}] 原表 n=${l[0].n} fp=${l[0].fp} · 影子表 n=${r[0].n} fp=${r[0].fp}`);
    }
  }
  return slices;
}

if (DIFF) {
  if (!(await exists(SHADOW_TABLE))) fatal(`影子表 ${SHADOW_TABLE} 不存在，请先跑阶段一`);
  const d = await diffStats();
  console.log(`待补增量（新增或 update_time 变更）：${d.pending} 行`);
  console.log(`影子表多出的行（原表已删）：${d.orphan} 行${d.orphan ? " → 需人工确认后在影子表同步删除，否则切换会带回已删行" : ""}`);
  console.log(d.pending === 0 && d.orphan === 0 ? "✅ 两表当前等价，可择窗切换。" : "⚠️ 存在差异，切换时会自动补增量（删除行不会被自动处理）。");
  process.exit(0);
}

if (ROLLBACK) {
  const olds = (await q(
    `SELECT TABLE_NAME t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE '${OLD_TABLE_PREFIX}%'`,
  )).map((r) => r.t);
  if (!olds.length) fatal(`找不到旧表位 ${OLD_TABLE_PREFIX}*，无法反切`);
  if (olds.length > 1) fatal(`找到多个旧表位（${olds.join(", ")}），请人工指定后再反切`);
  const [oldTable] = olds;
  if (await exists(SHADOW_TABLE)) fatal(`${SHADOW_TABLE} 仍存在：反切前请先确认阶段一/二状态（避免名字撞车）`);
  await conn.query(
    `RENAME TABLE \`${OPP_TABLE}\` TO \`${SHADOW_TABLE}\`, \`${oldTable}\` TO \`${OPP_TABLE}\``,
  );
  console.log(`✅ 已反切：${oldTable} → ${OPP_TABLE}；切换后的精简表留在 ${SHADOW_TABLE}（可继续观察或人工 DROP）。`);
  console.log("别忘了重新解冻 daily-sync / crawler-sync。");
  process.exit(0);
}

// ── 切换 ────────────────────────────────────────────────────────────────
if (!CUTOVER) fatal(`未指定动作：--diff | --cutover --frozen | --rollback`);
if (!FROZEN) fatal("必须带 --frozen：切换窗口内外部同步（daily-sync / crawler-sync）未冻结会丢写，见 ADR-0003「外部实时写表」条");
if (!(await exists(SHADOW_TABLE))) fatal(`影子表 ${SHADOW_TABLE} 不存在，请先跑阶段一`);

console.log("[1/4] 补增量（按 id 分批幂等 upsert，多灌无害）");
let guard = 0;
for (;;) {
  const batch = await q(
    `SELECT o.id FROM \`${OPP_TABLE}\` o
       LEFT JOIN \`${SHADOW_TABLE}\` s ON s.id = o.id
      WHERE s.id IS NULL OR NOT (o.\`update_time\` <=> s.\`update_time\`)
      ORDER BY o.id LIMIT ${BACKFILL_BATCH}`,
  );
  if (!batch.length) break;
  const ids = batch.map((r) => Number(r.id)).join(", ");
  await conn.query(
    `INSERT INTO \`${SHADOW_TABLE}\` (${colList})
     SELECT ${colList} FROM \`${OPP_TABLE}\` WHERE \`id\` IN (${ids})
     ON DUPLICATE KEY UPDATE ${updateClause}`,
  );
  console.log(`  已补 ${batch.length} 行（id ≤ ${Math.max(...batch.map((r) => Number(r.id)))}）`);
  if (++guard > 200) fatal("补增量循环超过 200 批，疑似同步未冻结（原表仍在被写）→ 停线人工确认");
}

console.log("[2/4] 切换前全表对账");
const slices = await reconcile();
const d = await diffStats();
if (d.pending) fatal(`仍有 ${d.pending} 行差异未消除，禁止切换`);
console.log(`  ${slices} 片列指纹逐片一致；影子表多余行 ${d.orphan}（>0 时需人工判断）`);

console.log("[3/4] 原子 RENAME（秒级，单语句内完成两步改名）");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const oldTable = `${OLD_TABLE_PREFIX}${stamp}`;
if (await exists(oldTable)) fatal(`旧表位 ${oldTable} 已存在，请先人工处置（改名或清理）再切换`);
await conn.query(
  `RENAME TABLE \`${OPP_TABLE}\` TO \`${oldTable}\`, \`${SHADOW_TABLE}\` TO \`${OPP_TABLE}\``,
);
console.log(`  ${OPP_TABLE} ⇐ 精简表；原表保留为 ${oldTable}`);

console.log("[4/4] 切换后自检");
const after = (await q(
  `SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${OPP_TABLE}'`,
))[0].n;
const rowsAfter = (await q(`SELECT COUNT(*) n FROM \`${OPP_TABLE}\``))[0].n;
const oldRows = (await q(`SELECT COUNT(*) n FROM \`${oldTable}\``))[0].n;
if (rowsAfter !== oldRows) fatal(`切换后行数 ${rowsAfter} ≠ 旧表 ${oldRows}`);
console.log(`  现网 ${OPP_TABLE}：${after} 列 / ${rowsAfter} 行（旧表位 ${oldRows} 行）`);

console.log("\n✅ 阶段二完成。收尾清单：");
console.log("  1) 解冻外部同步（重启 daily-sync 或置回 SYNC_WORKER_IN_APP）；");
console.log("     同步是「源∩目标」交集写列，被删的列会自动跳过并打告警（见本仓 daily-sync.cjs 交集语义），不报错");
console.log("  2) 观察稳定后人工 DROP 旧表位（它是切换后的唯一反滚物）：" + oldTable);
console.log("     切换前的 79 列 / 22 索引原文留档在 git 历史（scripts/tools/ 下的 before-slim 快照已随旧列退役清理）；");
console.log("     DROP 前建议再对旧表位做一次 SHOW CREATE TABLE，拿当下真值（而非快照）作为回建依据。");
console.log("  3) 重导结构基线：node --env-file=.env scripts/tools/dump-schema-baseline.mjs");
console.log("  4) 回滚窗口内如需反切：本脚本 --rollback");
await conn.end();
