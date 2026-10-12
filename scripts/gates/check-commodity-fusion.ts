/**
 * 融合树门禁 FU1~FU7（影子表版）
 *
 * @script scripts/gates/check-commodity-fusion.ts
 * @assertions
 *   FU1 形制：^UGT-\d{3}(\d{3})*$；level=(len-4)/3 且与存列一致；父码=去末3位且存在（L1 父为空串）；码长≤64
 *   FU2 大类只增不减：每个 L1 的 group_code 非空；新 L1 数 ≥ 32；旧 32 各大类都能回收 ≥1 个新 L1
 *   FU3 一码一爹：xwalk 必须带 UNIQUE(std,std_code) 索引；且 GROUP BY std,std_code HAVING COUNT>1 必空
 *   FU4 单调归属：同主轴下子的 axis_code 必须以父的 axis_code 为前缀（跨标准不比 axis，走 xwalk 归属）
 *   FU5 语义闸：attach_status/name_status='pending' 计数上报；超 --max-pending 退出非 0
 *   FU7 无残渣：融合表内不得混入任何旧前缀（UGT-B-/UGT-C-/UGT-G-）——两套前缀必须物理隔离
 *   （FU6「列值可由纯函数重算对拍」需公告影子列灌好后执行，见 fusion-reattribute.mjs）
 * @limits 静态段可在无 MySQL 的 CI 里跑；--db 是本地/发布前闸口。
 *         影子表未建（P0 阶段）只 WARN 并跳过库内断言，退出 0 —— 建表是人工闸口，不拿缺失当失败。
 * @usage  npm 直调：npx tsx scripts/gates/check-commodity-fusion.ts --db [--max-pending=0]
 * @see    docs/superpowers/specs/2026-10-12-品目树融合-design.md
 */
import { readFileSync } from "node:fs";
import { isFusionNode, FUSION_NODE_PREFIX } from "../../src/lib/services/commodity/fusion-path";
import {
  collectEdgeViolations,
  hasFatal,
  type FusionRow,
} from "../../src/lib/services/commodity/fusion-tree";
import { COMMODITY_GROUPS } from "../../src/lib/services/commodity/groups";

const DB = process.argv.includes("--db");
const maxPendingArg = process.argv.find((a) => a.startsWith("--max-pending="));
const MAX_PENDING = maxPendingArg ? Number(maxPendingArg.split("=")[1]) : Infinity;
const NODE_TABLE = "crm_commodity_backbone_fusion__new";
const XWALK_TABLE = "crm_commodity_fusion_xwalk__new";

const fails: string[] = [];
const warns: string[] = [];
const fail = (m: string) => fails.push(m);
const warn = (m: string) => warns.push(m);

// ── 静态自检：断言不许哑火（注入脏码必须被判非法）──
if (isFusionNode("UGT-B-043") || isFusionNode("UGT-04") || !isFusionNode("UGT-043115")) {
  fail("FU0 fusion-path 形制判定异常，门禁已哑火");
}
if (COMMODITY_GROUPS.length !== 32) {
  fail(`FU0 旧大类常量数=${COMMODITY_GROUPS.length}，应为 32（大类只增不减的基线锚点）`);
}

if (!DB) {
  console.log(`静态：前缀 ${FUSION_NODE_PREFIX}/3位每层 · 旧大类 32 · 影子表 ${NODE_TABLE}/${XWALK_TABLE}（库内断言请加 --db）`);
  if (fails.length) { console.error(`✗ ${fails.join("；")}`); process.exit(1); }
  console.log("✓ 静态部分通过");
  process.exit(0);
}

const mysql = (await import("mysql2/promise")).default;
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
type R = Record<string, string | number | null>;
const q = async (sql: string, a?: unknown[]) => ((await pool.query(sql, a)) as [R[], unknown])[0];
const one = async (sql: string) => (await q(sql))[0] as R;

const exists = async (t: string) =>
  Number((await one(`SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='${t}'`)).n) > 0;

if (!(await exists(NODE_TABLE))) {
  warn(`影子表 ${NODE_TABLE} 不存在：P0 阶段建表属人工闸口，库内断言本次跳过`);
} else {
  const rows = (await q(
    `SELECT code, parent_code, level, group_code, axis_std, axis_code FROM ${NODE_TABLE}`,
  )) as unknown as FusionRow[];
  // FU1 结构 + FU4 单调归属（同标准机检 fatal、跨标准/父未随行送 human）：复用已测内核，与建树工具同一口径
  const viol = collectEdgeViolations(rows);
  const fatals = viol.filter((v) => v.fatal.length);
  if (fatals.length) fail(`FU1/FU4 有 ${fatals.length} 条边硬失败：` + fatals.slice(0, 10).map((v) => `${v.code}[${v.fatal.join("|")}]`).join(" ; "));
  const needHuman = viol.filter((v) => v.human.length && !v.fatal.length);
  if (needHuman.length) warn(`FU4 有 ${needHuman.length} 条边需人工/crosswalk 证明（跨标准或父未随行）`);
  // FU7 无残渣：融合表内不得出现旧前缀
  const legacy = await one(
    `SELECT COUNT(*) n FROM ${NODE_TABLE} WHERE code NOT LIKE 'UGT-[0-9]%' OR code LIKE 'UGT-B%' OR code LIKE 'UGT-C%' OR code LIKE 'UGT-G%'`,
  );
  if (Number(legacy.n) > 0) fail(`FU7 融合表混入 ${legacy.n} 条非 UGT-<数字> 前缀（旧前缀污染，两套必须物理隔离）`);

  // FU2 大类只增不减
  const l1 = await q(`SELECT code, group_code FROM ${NODE_TABLE} WHERE level=1`);
  const l1Count = l1.length;
  if (l1Count < 32) fail(`FU2 新 L1 数=${l1Count} < 32（大类只增不减被破坏）`);
  const coveredGroups = new Set(l1.map((r) => String(r.group_code)).filter((g) => g && g !== ""));
  for (const g of COMMODITY_GROUPS) {
    if (!coveredGroups.has(g.code)) fail(`FU2 旧大类 ${g.code} 无任何新 L1 回收（无损回溯断裂）`);
  }
  const nullGroupL1 = l1.filter((r) => !String(r.group_code)).length;
  if (nullGroupL1) fail(`FU2 有 ${nullGroupL1} 个 L1 的 group_code 为空`);
  console.log(`FU2 新 L1=${l1Count}（基线 32）· 覆盖旧大类 ${coveredGroups.size}/32`);

  // （FU4 单调归属已由上方 collectEdgeViolations 内核覆盖，含 UNSPSC 补位归一，无需再走 SQL 前缀比对）

  // FU5 语义闸
  const pend = await one(`SELECT SUM(attach_status='pending') a, SUM(name_status='pending') nm FROM ${NODE_TABLE}`);
  const pending = Number(pend.a ?? 0) + Number(pend.nm ?? 0);
  console.log(`FU5 待审 pending：挂载 ${pend.a ?? 0} / 命名 ${pend.nm ?? 0}`);
  if (pending > MAX_PENDING) fail(`FU5 pending=${pending} 超阈值 --max-pending=${MAX_PENDING}（未过审不得放行）`);
}

if (!(await exists(XWALK_TABLE))) {
  warn(`账本表 ${XWALK_TABLE} 不存在：跳过 FU3`);
} else {
  // FU3 一码一爹：UNIQUE 索引必须在场 + 逐码查重
  const uniqIdx = await one(`
    SELECT COUNT(*) n FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='${XWALK_TABLE}'
      AND NON_UNIQUE=0 AND SEQ_IN_INDEX=1 AND COLUMN_NAME='std'`);
  if (Number(uniqIdx.n) === 0) fail("FU3 xwalk 缺 UNIQUE(std,...) 索引：一码一爹无物理保证");
  const dup = await one(`
    SELECT COUNT(*) n FROM (
      SELECT std, std_code FROM ${XWALK_TABLE} GROUP BY std, std_code HAVING COUNT(*)>1) d`);
  if (Number(dup.n) > 0) fail(`FU3 有 ${dup.n} 个外部码归属多个节点（两个爹）`);
}

await pool.end();
if (warns.length) console.log(`⚠ ${warns.join("；")}`);
if (fails.length) { console.error(`✗ ${fails.join("\n  ✗ ")}`); process.exit(1); }
console.log("✓ 融合树门禁通过（FU6 重算对拍待公告影子列灌好后并入）");
