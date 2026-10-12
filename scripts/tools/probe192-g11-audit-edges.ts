/**
 * 探针192（只读）：72 段覆盖缺口 + 空节点 + 叶子公告量 + 相邻大类边界
 *
 * 与探针191 配套：191 看「树怎么切的」，本探针看
 *  C 旧字典 72 段有哪些族/类，树里没接的（公告无处安放 = 结构性缺口）；
 *  O 有多少 L4/L5 节点一条公告都没挂（造了没人用的桶）；
 *  L 叶子级公告量 Top（混装叶子）；
 *  N 相邻大类（G-05 建材 / G-12 清洁设施维护 / G-21 发电配电 / G-22 不动产市政 / G-28 采掘农林装备 / G-14 工程技术）
 *    的 L2/L3 清单 —— 判「该不该挪出 72」必须知道对面抽屉叫什么。
 *
 * 为什么入库：归位规格的「族级缺口」与「跳大类待议」判定全部来自本探针输出（相邻抽屉名字只有查库才知道）。
 *
 * 用法：node --env-file=.env scripts/tools/probe192-g11-audit-edges.ts
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const OUT = new URL("../../runtime/commodity-g11-audit-edges.txt", import.meta.url);
const buf: string[] = [];
const say = (...a: unknown[]) => buf.push(a.join(" "));

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
const q = async (sql: string, a?: unknown[]) => (await conn.query(sql, a))[0] as Record<string, unknown>[];

// ── C 旧字典里 72 段的码形制（先摸清 code 长度与 level 的对应）──
say("=== C0 crm_unspsc_codes 中 72 段的 code 长度 × level 分布 ===");
const shape = (await q(
  `SELECT LENGTH(code) len, level, COUNT(*) n FROM crm_unspsc_codes WHERE code LIKE '72%' GROUP BY LENGTH(code), level ORDER BY len, level`,
)) as Record<string, unknown>[];
for (const r of shape) say(`len=${r.len} level=${r.level} 行数=${r.n}`);

say("\n=== C1 字典 72 段族/类清单（含公告数）与树覆盖 ===");
const tree = (await q(
  `SELECT code, level, unspsc_prefix FROM crm_commodity_backbone WHERE group_code='UGT-G-11'`,
)) as { code: string; level: number; unspsc_prefix: string | null }[];
const treeCls = new Set(tree.filter((r) => r.level === 4).map((r) => r.unspsc_prefix ?? ""));
const dictCls = (await q(
  `SELECT LEFT(code,6) cls, MAX(title_zh) zh, MAX(title) en FROM crm_unspsc_codes WHERE code LIKE '72%' AND LENGTH(code)=8 AND RIGHT(code,2)='00' AND RIGHT(code,4)<>'0000' GROUP BY LEFT(code,6) ORDER BY cls`,
)) as { cls: string; zh: string; en: string }[];
say(`字典类数（8 位粗码 6 位有效）=${dictCls.length}；树 L4 数=${treeCls.size}`);
for (const r of dictCls) {
  if (!treeCls.has(r.cls)) say(`  字典有、树里没有：${r.cls} ${r.zh ?? ""} / ${r.en ?? ""}`);
}
const dictFams = (await q(
  `SELECT LEFT(code,4) fam, MAX(title_zh) zh, MAX(title) en FROM crm_unspsc_codes WHERE code LIKE '72%' AND LENGTH(code)=8 AND RIGHT(code,4)='0000' GROUP BY LEFT(code,4) ORDER BY fam`,
)) as { fam: string; zh: string; en: string }[];
say(`字典族数=${dictFams.length}：`);
for (const r of dictFams) say(`  ${r.fam} ${r.zh ?? ""} / ${r.en ?? ""}`);

// ── C2 公告实际用到的 72 段 6 位前缀，树里有没有家 ──
say("\n=== C2 桥表里 72 段的类级前缀 × 公告数（对树覆盖）===");
const used = (await q(
  `SELECT LEFT(c.code,6) cls, COUNT(DISTINCT c.notice_id) n
     FROM crm_bid_notice_unspsc_codes c WHERE c.code LIKE '72%' AND LENGTH(c.code)=8
    GROUP BY LEFT(c.code,6) ORDER BY cls`,
)) as { cls: string; n: number }[];
let orphanNotice = 0;
for (const r of used) {
  const has = treeCls.has(String(r.cls));
  if (!has) orphanNotice += Number(r.n);
  say(`  ${r.cls} 公告=${r.n}${has ? "" : "  ← 树里无此类（L4）"}`);
}
say(`无家类合计公告（去重前缀口径，仅供参考）=${orphanNotice}`);

// ── O 空节点 ──
say("\n=== O 节点公告量：空节点统计 ===");
const codes = tree.map((r) => r.code);
const cnt = new Map<string, number>();
for (let i = 0; i < codes.length; i += 250) {
  const part = codes.slice(i, i + 250);
  const res = (await q(
    `SELECT node, COUNT(*) n FROM crm_notice_backbone_nodes WHERE node IN (?) GROUP BY node`,
    [part],
  )) as { node: string; n: number }[];
  for (const r of res) cnt.set(String(r.node), Number(r.n));
}
const meta = (await q(
  `SELECT code, level, parent_code, unspsc_prefix, name_zh FROM crm_commodity_backbone WHERE group_code='UGT-G-11'`,
)) as { code: string; level: number; parent_code: string; unspsc_prefix: string | null; name_zh: string }[];
const zero = meta.filter((r) => r.level >= 4 && (cnt.get(r.code) ?? 0) === 0);
say(`（空节点合计 ${zero.length} 个，含 L4/L5）`);
say(`L4 空节点=${meta.filter((r) => r.level === 4 && (cnt.get(r.code) ?? 0) === 0).length}/${meta.filter((r) => r.level === 4).length}；L5 空节点=${meta.filter((r) => r.level === 5 && (cnt.get(r.code) ?? 0) === 0).length}/${meta.filter((r) => r.level === 5).length}`);
for (const r of meta.filter((x) => x.level === 4 && (cnt.get(x.code) ?? 0) === 0)) say(`  空 L4 ${r.unspsc_prefix} ${r.name_zh}`);

// ── L 叶子公告量 Top 30 ──
say("\n=== L 公告量 Top 30 的 L5 品目（含其 L4 归属）===");
const l4map = new Map(meta.filter((r) => r.level === 4).map((r) => [r.code, r]));
const topL5 = meta
  .filter((r) => r.level === 5)
  .map((r) => ({ ...r, n: cnt.get(r.code) ?? 0 }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 30);
for (const r of topL5) {
  const l4 = l4map.get(r.parent_code);
  say(`  ${r.unspsc_prefix} ${r.name_zh}｜公告=${r.n}｜L4=${l4?.unspsc_prefix} ${l4?.name_zh}`);
}

// ── L4 公告量 Top（判桶大小）──
say("\n=== L4 公告量 Top 20 ===");
for (const r of meta
  .filter((x) => x.level === 4)
  .map((x) => ({ ...x, n: cnt.get(x.code) ?? 0 }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 20)) {
  say(`  ${r.unspsc_prefix} ${r.name_zh}｜公告=${r.n}`);
}

// ── N 相邻大类的 L2/L3 ──
say("\n=== N 相邻大类结构（判跨类边界）===");
const others = ["UGT-G-05", "UGT-G-12", "UGT-G-21", "UGT-G-22", "UGT-G-28", "UGT-G-14", "UGT-G-09", "UGT-G-10"];
for (const g of others) {
  const sub = (await q(
    `SELECT code, parent_code, level, unspsc_prefix, name_zh FROM crm_commodity_backbone
       WHERE group_code=? AND level<=3 ORDER BY code`,
    [g],
  )) as { code: string; parent_code: string; level: number; unspsc_prefix: string | null; name_zh: string }[];
  const c4 = (await q(
    `SELECT COUNT(*) n FROM crm_commodity_backbone WHERE group_code=? AND level=4`,
    [g],
  )) as { n: number }[];
  say(`\n## ${g}（L4 数=${c4[0]?.n ?? 0}）`);
  const byCode = new Map(sub.map((r) => [r.code, r]));
  for (const r of sub) {
    const ind = r.level === 1 ? "" : r.level === 2 ? "  " : "    ";
    const parent = r.level === 3 ? byCode.get(r.parent_code) : undefined;
    void parent;
    say(`${ind}L${r.level} ${r.name_zh}${r.unspsc_prefix ? ` [${r.unspsc_prefix}]` : ""}`);
  }
}

await conn.end();
writeFileSync(OUT, buf.join("\r\n"), { encoding: "utf8" });
console.log(`written ${buf.length} lines`);

