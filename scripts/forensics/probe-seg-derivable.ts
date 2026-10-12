/**
 * 一次性探针：段归属表能不能被删
 *
 * 问题：crm_commodity_group_segments（58 行 unspsc_prefix → group_code）是不是冗余的？
 *   若「树反推的段→大类」与「常量」「库内本表」三者逐段相同，则本表不携带任何独立信息。
 *
 * 与前人 probe58 的差别：那边用 MIN(l1.group_code) 取一个值，会掩盖「一段的多个族落在不同 L1」
 *   这种退化（MIN 照样给出一个数）。这里逐段查 COUNT(DISTINCT ...)，把唯一性显式量出来。
 *
 * 只读。用法：npx tsx scripts/forensics/probe-seg-derivable.ts
 *
 * 可跑性（入库时注）：口径 B 与「谁还存着大类码」两处读 `crm_commodity_group_segments`，
 *   该表已按 ADR-0009 退役 ⇒ 今天在现网重跑会在 L35 报「表不存在」。
 *   本件作为 ADR-0009 判据的现场留档（SQL 全文可审），不是可重跑工具；
 *   若要重跑，先用 runtime/commodity-group-segments-dump-*.sql 回灌该表。
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { COMMODITY_GROUPS, EXPECTED_COMMODITY_GROUP_COUNT } from "../../src/lib/services/commodity/groups.js";

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
const q = async (sql: string, a?: unknown[]) => ((await pool.query(sql, a)) as [RowDataPacket[], unknown])[0];

const problems: string[] = [];

// ── 口径 A：常量 ──
const constMap = new Map<string, string>();
for (const g of COMMODITY_GROUPS) for (const p of g.prefixes) constMap.set(p, g.code);
console.log(`A 常量：${COMMODITY_GROUPS.length} 类 / ${constMap.size} 段前缀（期望 ${EXPECTED_COMMODITY_GROUP_COUNT} 类）`);

// ── 口径 B：库内段归属表 ──
const segRows = await q(`SELECT unspsc_prefix, group_code FROM crm_commodity_group_segments`);
const dbMap = new Map(segRows.map((r) => [String(r.unspsc_prefix), String(r.group_code)]));
console.log(`B 库内本表：${dbMap.size} 段`);

// ── 口径 C：树反推（两条独立路径，互相印证）──
// C1 靠每行冗余的 group_code（L4 行直接带大类码）
const c1 = await q(`
  SELECT LEFT(unspsc_prefix, 2) seg, COUNT(DISTINCT group_code) kinds, MIN(group_code) g
    FROM crm_commodity_backbone
   WHERE level = 4 AND unspsc_prefix IS NOT NULL
   GROUP BY LEFT(unspsc_prefix, 2) ORDER BY seg`);
// C2 靠祖先链（L4 → L3 → L2 → L1 取 L1 的 group_code），不信任冗余列
const c2 = await q(`
  SELECT LEFT(b4.unspsc_prefix, 2) seg, COUNT(DISTINCT b1.group_code) kinds, MIN(b1.group_code) g
    FROM crm_commodity_backbone b4
    JOIN crm_commodity_backbone b3 ON b3.code = b4.parent_code
    JOIN crm_commodity_backbone b2 ON b2.code = b3.parent_code
    JOIN crm_commodity_backbone b1 ON b1.code = b2.parent_code
   WHERE b4.level = 4 AND b4.unspsc_prefix IS NOT NULL
   GROUP BY LEFT(b4.unspsc_prefix, 2) ORDER BY seg`);
const c1Map = new Map(c1.map((r) => [String(r.seg), String(r.g)]));
const c2Map = new Map(c2.map((r) => [String(r.seg), String(r.g)]));
console.log(`C1 树反推（用 L4 冗余 group_code）：${c1Map.size} 段`);
console.log(`C2 树反推（走祖先链到 L1）      ：${c2Map.size} 段`);

// ── 唯一性：一段是否只落一个 L1 ──
const multi1 = c1.filter((r) => Number(r.kinds) !== 1);
const multi2 = c2.filter((r) => Number(r.kinds) !== 1);
console.log(`\n唯一性：C1 一段跨多大类 ${multi1.length} 段；C2 ${multi2.length} 段`);
for (const r of [...multi1, ...multi2].slice(0, 10)) console.log(`   ⚠ 段 ${r.seg} 落在 ${r.kinds} 个大类`);
if (multi1.length || multi2.length) problems.push("存在一段跨多大类：树反推不唯一，删表前必须先修树");

// ── 三方逐段对拍 ──
const allSegs = new Set([...constMap.keys(), ...dbMap.keys(), ...c1Map.keys(), ...c2Map.keys()]);
const diff: string[] = [];
for (const seg of [...allSegs].sort()) {
  const a = constMap.get(seg) ?? "(常量无)";
  const b = dbMap.get(seg) ?? "(本表无)";
  const x = c1Map.get(seg) ?? "(树无)";
  const y = c2Map.get(seg) ?? "(树无)";
  if (!(a === b && b === x && x === y)) diff.push(`段 ${seg}: 常量=${a} 本表=${b} 树冗余=${x} 树祖先链=${y}`);
}
console.log(`\n三方逐段对拍：共 ${allSegs.size} 段，不一致 ${diff.length} 段`);
for (const d of diff.slice(0, 15)) console.log("   " + d);
if (diff.length) problems.push("三方口径不一致：本表与常量/树存在分歧，删表前必须先收敛");

// ── 反向：树里有没有本表/常量都没有的段 ──
const extraInTree = [...c1Map.keys()].filter((s) => !constMap.has(s));
const extraInDb = [...dbMap.keys()].filter((s) => !constMap.has(s));
console.log(`树里多出、常量没有的段：${extraInTree.join(",") || "无"}；本表多出、常量没有的段：${extraInDb.join(",") || "无"}`);

// ── 删表后大类码域还在不在（骨架 L1 是否自带 32 个码）──
const l1 = await q(`
  SELECT COUNT(*) rows_n, COUNT(DISTINCT group_code) codes,
         SUM(group_code NOT REGEXP '^UGT-G-[0-9]{2}$') bad
    FROM crm_commodity_backbone WHERE level = 1`);
const l1Set = new Set((await q(`SELECT DISTINCT group_code g FROM crm_commodity_backbone WHERE level = 1`)).map((r) => String(r.g)));
const constSet = new Set(COMMODITY_GROUPS.map((g) => g.code));
const l1Missing = [...constSet].filter((c) => !l1Set.has(c));
const l1Extra = [...l1Set].filter((c) => !constSet.has(c));
console.log(
  `\n骨架 L1：${l1[0].rows_n} 行 / ${l1[0].codes} 个去重大类码 / 形制非法 ${l1[0].bad}；` +
    `常量有而 L1 无 ${l1Missing.length} 个、L1 有而常量无 ${l1Extra.length} 个`,
);

// ── 谁还存着大类码（判断删表的收益面）──
const holders = await q(`
  SELECT 'crm_commodity_group_segments' t, COUNT(*) n, COUNT(DISTINCT group_code) c FROM crm_commodity_group_segments
  UNION ALL SELECT 'crm_commodity_backbone(L1)', COUNT(*), COUNT(DISTINCT group_code) FROM crm_commodity_backbone WHERE level=1
  UNION ALL SELECT 'crm_commodity_backbone(全部行)', COUNT(*), COUNT(DISTINCT group_code) FROM crm_commodity_backbone
  UNION ALL SELECT 'crm_notice_search.group_codes', SUM(group_codes IS NOT NULL AND group_codes<>''), COUNT(DISTINCT group_codes) FROM crm_notice_search
  UNION ALL SELECT 'crm_user_industry_prefs.group_code', COUNT(*), COUNT(DISTINCT group_code) FROM crm_user_industry_prefs`);
console.log("\n库里存着大类码的位置：");
for (const h of holders) console.log(`   ${String(h.t).padEnd(38)} 行/值=${h.n}  去重=${h.c}`);

console.log(`\n结论：${problems.length ? "❌ 暂不可删\n  - " + problems.join("\n  - ") : "✅ 本表不携带独立信息（三方逐段全等、树反推唯一）"}`);
await pool.end();
