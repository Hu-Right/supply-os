/**
 * 品目树 01 归位 · 阶段二（影响面核算 → 原子切换 → 反切回滚；切换后派生层重算清单）
 *
 * 纪律（docs/adr/0003 阶段二）：人工确认完善后才换表；切换与建表绝不合并在同一自动迁移里。
 * 本脚本**默认只读**（--check），只有 --swap --yes 才动表名，只有 --cleanup --yes 才删派生行。
 *
 * 用法：
 *   npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --check          # 只读：闸口体检 + 影响面 + 打印计划
 *   npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --swap --yes     # ★ 原子 RENAME 切换（秒级）
 *   npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --rollback --yes # 反切回旧树（观察期报障用）
 *   npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --cleanup --yes  # 切换后清掉「不在新树里」的 01 子树旧落点/旧倒排行
 *
 * 为什么必须跟着重算派生层：01 子树 524/529 个节点码变了（码长即层级、父码=去末两级，
 * 父层重排 ⇒ 子码必变）。而落点表 / 倒排表 / 宽表 backbone_path 存的都是**节点码**，
 * 换树不清理就会出现「树里没这个码」——门禁 BB7/BB14/BB15 会直接红，筛选静默丢公告。
 * 落点表是 INSERT IGNORE 语义（重跑不删旧行），所以必须先清理再重灌；倒排表按块
 * DELETE+INSERT，全量重跑能自清。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
// 码长形状断言的前缀长度不写死：2026-10-13 改码后写死旧长度会把全表判成坏码，
// 而这是切换闸口里的“拦住”条件 —— 判错方向比不判更糟。
import { BACKBONE_NODE_PREFIX } from "../../src/lib/services/commodity/backbone-path.js";

const SWAP = process.argv.includes("--swap");
const ROLLBACK = process.argv.includes("--rollback");
const CLEANUP = process.argv.includes("--cleanup");
const YES = process.argv.includes("--yes");
const SRC = "crm_commodity_backbone";
const SHADOW = "crm_commodity_backbone__new";
const OLD = `crm_commodity_backbone__old_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const ATTR = "crm_notice_attribution_nodes";
const INVERTED = "crm_notice_backbone_nodes";
const STATE = "runtime/commodity-g11-rehome-state.json";

if ((SWAP || ROLLBACK || CLEANUP) && !YES) {
  console.error("✗ --swap / --rollback / --cleanup 都必须带 --yes（人工闸口）；先跑 --check");
  process.exit(1);
}
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
const q = async <T = Record<string, unknown>>(sql: string, a?: unknown[]) => ((await conn.query(sql, a)) as [T[], unknown])[0];
const fatal = (msg: string): never => { console.error(`\n❌ ${msg}`); process.exit(1); };
const exists = async (t: string) => Number((await q<{ n: number }>(
  `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${t}'`,
))[0].n) > 0;

const FP = "CONCAT_WS('|',code,parent_code,level,group_code,IFNULL(unspsc_prefix,''),name_zh,name_en,sort,status,note)";

// ── 反切 ──
if (ROLLBACK) {
  if (!(await exists(OLD))) fatal(`回滚目标 ${OLD} 不在库里：只支持本次切换产生的旧表位（名字带当天日期）`);
  if (await exists(SHADOW)) fatal(`${SHADOW} 仍在库里：反切会让两张表抢同一个正名，先确认状态`);
  await conn.query(`SET SESSION lock_wait_timeout = 5`);
  await conn.query(`RENAME TABLE \`${SRC}\` TO \`${SHADOW}\`, \`${OLD}\` TO \`${SRC}\``);
  console.log(`✅ 已反切：${OLD} → ${SRC}；新树退回 ${SHADOW}（可继续修或人工 DROP）`);
  console.log(`⚠ 反切后派生层里已经是新码，必须再走一次「--cleanup + 重灌」把归属刷回旧码，否则 BB15 会红。`);
  await conn.end();
  process.exit(0);
}

// ── 切换后清理孤儿码行（只删「带 01 前缀且不在当前树里」的行，不碰其它抽屉）──
// 列序规则实测两侧都是 utf8mb4_0900_ai_ci（probe198），故不加 COLLATE 转换：
// 加了不报错但会让优化器丢掉对侧索引（同项目 commodity-notice-nodes-ddl.ts 的结论）。
if (CLEANUP) {
  const targets: Array<{ table: string; codeCol: string }> = [];
  if (await exists(ATTR)) targets.push({ table: ATTR, codeCol: "node_code" });
  else console.log(`⚠ 落点表 ${ATTR} 不在本库（事实源未建），本项跳过`);
  if (await exists(INVERTED)) targets.push({ table: INVERTED, codeCol: "node" });
  else console.log(`⚠ 倒排表 ${INVERTED} 不在本库，本项跳过`);
  for (const t of targets) {
    const n = (await q<{ n: number }>(
      `SELECT COUNT(*) n FROM \`${t.table}\` a LEFT JOIN \`${SRC}\` b ON b.code = a.${t.codeCol}
        WHERE a.${t.codeCol} LIKE 'UGT-01%' AND b.code IS NULL`,
    ))[0];
    console.log(`${t.table} 的 01 子树孤儿行：${n.n}`);
    if (Number(n.n) > 0) {
      await conn.query(
        `DELETE a FROM \`${t.table}\` a LEFT JOIN \`${SRC}\` b ON b.code = a.${t.codeCol}
          WHERE a.${t.codeCol} LIKE 'UGT-01%' AND b.code IS NULL`,
      );
      console.log(`✓ 已删 ${t.table} 孤儿行 ${n.n}`);
    }
  }
  console.log(`下一步（顺序不可换，落点是事实源）：`);
  console.log(`  npx tsx scripts/ops/notice-attribution-backfill.ts --apply --yes`);
  console.log(`  npx tsx scripts/ops/commodity-backbone-path-backfill.ts --apply --yes --only-changed`);
  console.log(`  npx tsx scripts/ops/commodity-notice-nodes-backfill.ts --apply --yes`);
  console.log(`  npx tsx scripts/ops/commodity-backbone-path-backfill.ts --apply --yes --column precise_backbone_path --source approved --only-changed`);
  console.log(`  npm run check:backbone -- --db    # BB7/BB10/BB11/BB14/BB15 必须全绿`);
  await conn.end();
  process.exit(0);
}

// ── 体检（--check 与 --swap 前置都走同一套闸口）──
console.log(`连接 ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME} 模式：${SWAP ? "★ SWAP" : "CHECK 只读"}`);
if (!(await exists(SHADOW))) fatal(`影子表 ${SHADOW} 不存在：先跑阶段一 commodity-g11-rehome-shadow.ts --build --yes`);
if (!existsSync(STATE)) fatal(`缺 ${STATE}：阶段一没跑完，不能切换`);
const state = JSON.parse(readFileSync(STATE, "utf8")) as { srcRows: number; srcChecksum: string; at: string };

const srcNow = (await q<{ n: number; s: number }>(`SELECT COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\``))[0];
const drifted = String(state.srcChecksum) !== String(srcNow.s);
console.log(`闸口 1 原表水位：阶段一记录 ${state.srcRows}/${state.srcChecksum}（${state.at}），当前 ${srcNow.n}/${srcNow.s} ${drifted ? "⚠ 已被改过" : "✓ 未漂移"}`);
if (drifted && SWAP) fatal("原表在阶段一之后被改过（多半是正名脚本）：影子表已过期，请重跑阶段一再切");

const non01 = await q<{ side: string; n: number; s: number }>(
  `SELECT 'src' side, COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\` WHERE group_code<>'UGT-G-11'
     UNION ALL SELECT 'new', COUNT(*), IFNULL(SUM(CRC32(${FP})),0) FROM \`${SHADOW}\` WHERE group_code<>'UGT-G-11'`,
);
const [s0, s1] = [non01[0]!, non01[1]!];
console.log(`闸口 2 其余 31 抽屉：${s0.n} 行 ck=${s0.s} vs ${s1.n} 行 ck=${s1.s} ${String(s0.s) === String(s1.s) ? "✓" : "✗ 被改动"}`);
if (String(s0.s) !== String(s1.s) && SWAP) fatal("非 01 抽屉与新树不一致：影子表不可信，拒绝切换");

const shape = await q<{ bad_len: number; orphan: number; dup_prefix: number }>(
  `SELECT (SELECT COUNT(*) FROM \`${SHADOW}\` WHERE CHAR_LENGTH(code) <> ${BACKBONE_NODE_PREFIX.length} + level * 2) bad_len,
          (SELECT COUNT(*) FROM \`${SHADOW}\` c LEFT JOIN \`${SHADOW}\` p ON p.code = c.parent_code WHERE c.level > 1 AND p.code IS NULL) orphan,
          (SELECT COUNT(*) FROM (SELECT unspsc_prefix FROM \`${SHADOW}\` WHERE unspsc_prefix IS NOT NULL GROUP BY unspsc_prefix HAVING COUNT(*) > 1) t) dup_prefix`,
);
console.log(`闸口 3 影子表结构：码长不符 ${shape[0]?.bad_len ?? 0} / 父缺失 ${shape[0]?.orphan ?? 0} / 一码二爹 ${shape[0]?.dup_prefix ?? 0}`);
if ((shape[0]?.bad_len ?? 0) > 0 || (shape[0]?.orphan ?? 0) > 0 || (shape[0]?.dup_prefix ?? 0) > 0) fatal("影子表结构不合格，拒绝切换");

// 影响面（切换后必须重算的量）。只走 idx_node 前缀范扫；
// 不去拿宽表 backbone_path LIKE '%…'：那是 mediumtext 全表扫，实测不便宜，而重算本来就走全量管道。
const invImpact = await q<{ inv: number; notices: number }>(
  (await exists(INVERTED))
    ? `SELECT COUNT(*) inv, COUNT(DISTINCT notice_id) notices FROM \`${INVERTED}\` WHERE node LIKE 'UGT-01%'`
    : `SELECT 0 inv, 0 notices`,
);
const attrRows = (await exists(ATTR))
  ? (await q<{ n: number }>(`SELECT COUNT(*) n FROM \`${ATTR}\` WHERE node_code LIKE 'UGT-01%'`))[0]
  : { n: -1 };
const im = { ...invImpact[0]!, attr: attrRows.n };
console.log(`闸口 4 影响面：倒排行 ${im.inv} / 涉及公告 ${im.notices} / 落点行 ${im.attr < 0 ? "表未建" : im.attr}（宽表两列全量重跑，--only-changed 只写过期的行）`);

console.log(`\n将执行（原子、秒级）：`);
console.log(`  RENAME TABLE \`${SRC}\` TO \`${OLD}\`, \`${SHADOW}\` TO \`${SRC}\`;`);
console.log(`回滚位：${OLD}（保留到人工确认后再清理；应用侧表名不变，无需发版）`);

if (!SWAP) {
  console.log(`\n[check] 未切换。确认后执行：npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --swap --yes`);
  console.log(`切换后立刻按顺序做：--cleanup --yes → 重算落点/列值/倒排 → npm run check:backbone -- --db`);
  writeFileSync("runtime/commodity-g11-rehome-check.json", JSON.stringify({ at: new Date().toISOString(), srcNow, non01: { s0, s1 }, impact: im }, null, 2), "utf8");
  await conn.end();
  process.exit(0);
}

if (await exists(OLD)) fatal(`回滚位 ${OLD} 已存在：同一天重复切换前先人工处置（避免覆盖唯一回滚依据）`);
await conn.query(`SET SESSION lock_wait_timeout = 5`);
const before = (await q<{ n: number }>(`SELECT COUNT(*) n FROM \`${SRC}\``))[0];
await conn.query(`RENAME TABLE \`${SRC}\` TO \`${OLD}\`, \`${SHADOW}\` TO \`${SRC}\``);
const after = await q<{ n: number; s: number }>(`SELECT COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\``);
console.log(`\n✅ 已切换：${SRC} 行数 ${before.n} → ${after[0]?.n}（新树），旧树留在 ${OLD}`);
console.log(`⚠ 派生层此刻仍带着旧码，BB7/BB15 会红。立刻执行：`);
console.log(`  npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --cleanup --yes`);
await conn.end();
