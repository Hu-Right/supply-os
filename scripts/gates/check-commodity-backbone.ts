/**
 * 品目树门禁 BB1~BB6（单表结构版）
 *
 * @script scripts/gates/check-commodity-backbone.ts
 * @assertions
 *   BB1 码长即层级：UGT-B- 后 2/4/6/8/10 位对应 L1~L5；父码=自身去末两级且存在；每父子数 ≤ 99；名非空
 *   BB2 码全覆盖：本表带 6 位前缀的行数 = 原树类数、带 8 位 = 原树品目数，且逐码在原树里存在（一个不多一个不少）
 *   BB3 归属可推导且唯一：同一个族的所有类行必须落在同一个中类下；同一个段的所有族必须落在同一个大类下
 *   BB4 大类连续：节点 group_code = 祖先 group_code = 其 UNSPSC 段所属大类（对齐 group_segments）
 *   BB5 五级齐：L1 恰 32 行且 parent 为空串，L1~L5 每级都有行；同名兄弟只 WARN
 *   BB6 原树未被触碰：crm_commodity_nodes 行数 = 158,707，两表码域互斥
 * @limits 静态部分必须能在无 MySQL 的 CI 里跑；--db 是本地/发布前闸口。
 * @usage  npm run check:backbone     或     npx tsx scripts/gates/check-commodity-backbone.ts --db
 * @see    docs/superpowers/specs/2026-10-11-commodity-backbone-5level-design.md
 */
import { readFileSync } from "node:fs";
import { COMMODITY_GROUPS } from "../../src/lib/services/commodity/groups";

const DB = process.argv.includes("--db");
const EXPECT_ORIG_ROWS = 158707; // 原树：本次边界是「一行不动」

const fails: string[] = [];
const warns: string[] = [];
const fail = (m: string) => fails.push(m);

if (COMMODITY_GROUPS.length !== 32) fail(`BB0 大类常量数=${COMMODITY_GROUPS.length}，应为 32`);
const segToGroup = new Map<string, string>();
for (const g of COMMODITY_GROUPS) for (const p of g.prefixes) segToGroup.set(p, g.code);

if (!DB) {
  console.log(`静态：大类 32 / 五级码长 2-4-6-8-10 位 / 期望原树行数 ${EXPECT_ORIG_ROWS}`);
  if (fails.length) { console.error(`✗ ${fails.join("；")}`); process.exit(1); }
  console.log("✓ 静态部分通过（库内断言请加 --db）");
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

const claimsTable = await one(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_commodity_backbone_claims'`,
);
if (Number(claimsTable.n) !== 0) fail(`BB0 认领表 ${claimsTable.n} 张仍在库里——树应当只有一张表`);

const rows = await q(
  `SELECT code, parent_code, level, group_code, unspsc_prefix, name_zh FROM crm_commodity_backbone`,
) as unknown as { code: string; parent_code: string; level: number; group_code: string; unspsc_prefix: string | null; name_zh: string }[];
const orig = await one(
  `SELECT SUM(level='family') fam, SUM(level='class') cls, SUM(level='commodity') cmd, COUNT(*) total,
          SUM(code LIKE 'UGT-B-%') leaked FROM crm_commodity_nodes`,
);
const segRows = await q(`SELECT unspsc_prefix, group_code FROM crm_commodity_group_segments`);
for (const r of segRows) segToGroup.set(String(r.unspsc_prefix), String(r.group_code));

const byCode = new Map(rows.map((r) => [r.code, r]));
const kids = new Map<string, number>();

// ── BB1 ──
for (const r of rows) {
  if (!/^UGT-B-\d+$/.test(r.code)) { fail(`BB1 码形制非法：${r.code}`); continue; }
  if (r.code.length !== 6 + r.level * 2) fail(`BB1 码长与层级不符：${r.code}（L${r.level} 应为 ${6 + r.level * 2} 字符）`);
  if (r.level === 1) { if (r.parent_code !== "") fail(`BB1 大类行 parent 应为空串：${r.code}`); }
  else {
    if (r.parent_code !== r.code.slice(0, -2)) fail(`BB1 父码≠自身去末两级：${r.code}→${r.parent_code}`);
    if (!byCode.has(r.parent_code)) fail(`BB1 父节点不存在：${r.code}→${r.parent_code}`);
  }
  if (!r.name_zh) fail(`BB1 节点名为空：${r.code}`);
  kids.set(r.parent_code, (kids.get(r.parent_code) ?? 0) + 1);
}
for (const [p, k] of kids) if (k > 99) fail(`BB1 ${p} 下子节点 ${k} 个，超 2 位编码上限 99`);

// ── BB2 码全覆盖 ──
const p6 = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length === 6);
const p8 = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length === 8);
const pOther = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length !== 6 && r.unspsc_prefix.length !== 8);
if (pOther.length) fail(`BB2 出现非 6/8 位的码行 ${pOther.length} 条（段与族不建行，归属由祖先推导）`);
if (p6.length !== Number(orig.cls)) fail(`BB2 子类行数=${p6.length}，原树类数=${orig.cls}`);
if (p8.length !== Number(orig.cmd)) fail(`BB2 品目行数=${p8.length}，原树品目数=${orig.cmd}`);
const seenPrefix = new Set<string>();
for (const r of [...p6, ...p8]) {
  const p = String(r.unspsc_prefix);
  if (seenPrefix.has(p)) fail(`BB2 同一码在本表出现两行（一个码两个爹）：${p}`);
  seenPrefix.add(p);
}
// 原树类行存的是 8 位粗码（如 10101500），树里存的是 6 位类前缀⇒ 取键时同样截齐，不拿两种长度硬比
const srcCodes = await q(
  `SELECT CASE WHEN level='class' THEN LEFT(unspsc_code,6) ELSE unspsc_code END c
     FROM crm_commodity_nodes WHERE level IN ('class','commodity')`,
);
for (const r of srcCodes) {
  const c = String((r as Record<string, unknown>).c);
  if (!seenPrefix.has(c)) fail(`BB2 原树码 ${c} 在树里没有对应行 ⇒ 该码公告永远筛不到`);
}
// 树里的码必须都在原树里（不许凭空造码）
const srcSet = new Set(srcCodes.map((r) => String((r as Record<string, unknown>).c)));
for (const p of seenPrefix) if (!srcSet.has(p)) fail(`BB2 树里出现原树没有的码：${p}`);

// ── BB3 归属可推导且唯一 + BB4 大类连续 ──
const anc = (code: string, level: number) => code.slice(0, 6 + level * 2);
const famToL2 = new Map<string, string>();
for (const r of p6) {
  const fam = String(r.unspsc_prefix).slice(0, 4);
  const l2 = anc(r.code, 2);
  const prev = famToL2.get(fam);
  if (prev && prev !== l2) fail(`BB3 族 ${fam} 的类行跨了两个中类：${prev} 与 ${l2}`);
  famToL2.set(fam, l2);
  // BB4：类行的段 → 大类，必须等于自身与祖先的 group_code
  const seg = fam.slice(0, 2);
  const wantGroup = segToGroup.get(seg);
  const l1 = byCode.get(anc(r.code, 1))!;
  if (!l1) { fail(`BB4 祖先大类行缺失：${r.code}`); continue; }
  if (r.group_code !== l1.group_code) fail(`BB4 group_code 与祖先不一致：${r.code} ${r.group_code} vs ${l1.group_code}`);
  if (wantGroup && wantGroup !== r.group_code) fail(`BB4 段 ${seg} 应属 ${wantGroup}，但 ${r.code} 记的是 ${r.group_code}`);
}
if (famToL2.size !== Number(orig.fam)) fail(`BB3 可由类行反推出的族数=${famToL2.size}，原树族数=${orig.fam}`);
const segToL1 = new Map<string, string>();
for (const [fam, l2] of famToL2) {
  const seg = fam.slice(0, 2);
  const l1 = anc(l2, 1);
  const prev = segToL1.get(seg);
  if (prev && prev !== l1) fail(`BB3 段 ${seg} 跨了两个大类：${prev} 与 ${l1}`);
  segToL1.set(seg, l1);
}
if (segToL1.size !== 58) fail(`BB3 可反推的段数=${segToL1.size}，应为 58`);

// ── BB5 五级齐 + 命名质量 ──
const perLevel = [1, 2, 3, 4, 5].map((lv) => rows.filter((r) => r.level === lv).length);
for (const lv of [1, 2, 3, 4, 5]) if (!perLevel[lv - 1]) fail(`BB5 第 ${lv} 级没有任何行，五级不齐`);
if (perLevel[0] !== 32) fail(`BB5 大类行数=${perLevel[0]}，应为 32`);
// 正名后的红线：中类/小类不得用「等」这种含糊名，不得同父重名（子类/品目行名继承自原树，重名只 WARN）
const vague = rows.filter((r) => (r.level === 2 || r.level === 3) && r.name_zh.includes("等"));
if (vague.length) fail(`BB5 中类/小类还有 ${vague.length} 个带「等」的含糊名，如 ${vague[0]!.code} ${vague[0]!.name_zh}`);
const sibHard = new Set<string>();
const dupHard: string[] = [];
for (const r of rows) {
  if (r.level !== 2 && r.level !== 3) continue;
  const k = `${r.parent_code}|${r.name_zh}`;
  if (sibHard.has(k)) dupHard.push(k);
  sibHard.add(k);
}
if (dupHard.length) fail(`BB5 中类/小类同父重名 ${dupHard.length} 处，如 ${dupHard[0]}`);
// 正名收尾：不许再挂建树时的「待人工正名」标记（名字已是止于正名的成品，否则说明正名没做完）
const stale = await one(`SELECT COUNT(*) n FROM crm_commodity_backbone WHERE level IN (2,3) AND note LIKE '%待人工正名%'`);
if (Number(stale.n) !== 0) fail(`BB5 还有 ${stale.n} 个中类/小类挂着「待人工正名」标记，正名未收尾`);
const sib = new Set<string>();
let sibWarn = 0;
for (const r of rows) {
  if (r.level < 4) continue;
  const k = `${r.parent_code}|${r.name_zh}`;
  if (sib.has(k)) sibWarn++;
  sib.add(k);
}
// 名字里还带拉丁词的 中类/小类：来自事实层缺译名的族/类（不是命名错误，但要盯）
for (const r of rows) if ((r.level === 2 || r.level === 3) && /[A-Za-z]{3,}/.test(r.name_zh)) warns.push(r.code);
if (warns.length) console.log(`⚠ ${warns.length} 个中类/小类名含拉丁词（事实层本身缺中文译名）：${warns.slice(0, 3).join("、")}${warns.length > 3 ? " …" : ""}`);

// ── BB6 原树未动 ──
if (Number(orig.total) !== EXPECT_ORIG_ROWS) fail(`BB6 原树行数=${orig.total}，应为 ${EXPECT_ORIG_ROWS}`);
if (Number(orig.leaked) !== 0) fail(`BB6 原树里出现树码 ${orig.leaked} 行，码域被污染`);

console.log(`树：L1 ${perLevel[0]} / L2 ${perLevel[1]} / L3 ${perLevel[2]} / L4 ${perLevel[3]} / L5 ${perLevel[4]}（合计 ${rows.length} 行，一张表）`);
console.log(`码行：6 位 ${p6.length} / 8 位 ${p8.length}；可反推 族 ${famToL2.size} / 段 ${segToL1.size}`);
console.log(`规模带（每父的子数）：中类/大类 ${bandof(1)}｜小类/中类 ${bandof(2)}｜子类/小类 ${bandof(3)}｜品目/子类 ${bandof(4)}`);
if (sibWarn) console.log(`⚠ ${sibWarn} 条同名兄弟（子类/品目行继承原树名，不改）`);
/** 入参是父的层级：父码长 = 6 + 父层级×2（L1=8、L2=10…），kids 是按 parent_code 计数的 */
function bandof(parentLevel: number) {
  const len = 6 + parentLevel * 2;
  const s = [...kids.entries()].filter(([p]) => p.length === len).map(([, k]) => k).sort((a, b) => a - b);
  return s.length ? `min ${s[0]} / 中位 ${s[Math.floor(s.length / 2)]} / max ${s[s.length - 1]}` : "无";
}
if (fails.length) {
  console.error(`✗ 品目树门禁未通过（${fails.length} 条）：\n  - ${[...new Set(fails)].slice(0, 25).join("\n  - ")}`);
  await pool.end();
  process.exit(1);
}
console.log(`✅ BB1~BB6 通过：${rows.length} 行一张表，原树 ${orig.total} 行未动`);
await pool.end();
