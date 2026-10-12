/**
 * 探针191（只读）：UGT-G-11「建筑施工与运维服务」子树体检 —— 结构 + 公告量 + 覆盖缺口 + 叶子清单
 *
 * 为什么入库：本次归位的全部结构判据（3 中类/9 小类、17,948 公告的混装桶、逐子类公告量）
 *   都出自这份输出；它活在 temp 里会被清理，而归位规格与单测的注释都在引用它。
 *
 * 输出直接落 UTF-8 文件（PowerShell 重定向会把 node 的 UTF-8 stdout 按 GBK 解码成乱码）。
 *
 * 要回答的四件事：
 *  A/B 每个中类/小类/子类挂了多少公告 —— 判「哪个桶是混装重灾区」要有量，不能只看名字；
 *  C   UNSPSC 72 段在旧字典里有几个族/类，树里接了几个 —— 族级缺口 = 公告无处安放的段；
 *  D   叶子最多的若干 L4 的品目清单 —— L4 名字是否容得下它的 L5，只能看叶子。
 *
 * 用法：node --env-file=.env scripts/tools/probe191-g11-audit-tree.ts [UGT-G-xx]
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const GROUP = process.argv[2] ?? "UGT-G-11";
const OUT = new URL("../../runtime/commodity-g11-audit-tree.txt", import.meta.url);
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

const rows = (await q(
  `SELECT code, parent_code, level, unspsc_prefix, name_zh, name_en, note, status
     FROM crm_commodity_backbone WHERE group_code = ? ORDER BY code`,
  [GROUP],
)) as {
  code: string; parent_code: string; level: number; unspsc_prefix: string | null;
  name_zh: string; name_en: string; note: string; status: number;
}[];
const byLevel = new Map<number, typeof rows>();
for (const r of rows) {
  if (!byLevel.has(r.level)) byLevel.set(r.level, []);
  byLevel.get(r.level)!.push(r);
}
const kids = (code: string, lv: number) => (byLevel.get(lv) ?? []).filter((r) => r.parent_code === code);

// ── 公告量：倒排表 idx_node(node,notice_id) 点范围扫，只问本组的 L2~L4 ──
const codes = rows.filter((r) => r.level >= 1 && r.level <= 4).map((r) => r.code);
const cnt = new Map<string, number>();
for (let i = 0; i < codes.length; i += 200) {
  const part = codes.slice(i, i + 200);
  const res = (await q(
    `SELECT node, COUNT(*) n FROM crm_notice_backbone_nodes WHERE node IN (?) GROUP BY node`,
    [part],
  )) as { node: string; n: number }[];
  for (const r of res) cnt.set(String(r.node), Number(r.n));
}
const L5of = (l4: string) => (byLevel.get(5) ?? []).filter((r) => r.parent_code === l4).length;

say(`# ${GROUP} 子树体检（行数 ${rows.length}：L2=${byLevel.get(2)?.length ?? 0} L3=${byLevel.get(3)?.length ?? 0} L4=${byLevel.get(4)?.length ?? 0} L5=${byLevel.get(5)?.length ?? 0}）`);
say(
  "\n=== A 结构总览（含公告量·倒排表行数，L5=品目数）===",
);
for (const l1 of byLevel.get(1) ?? []) {
  say(`L1 ${l1.code} ${l1.name_zh}｜公告=${cnt.get(l1.code) ?? 0}`);
  for (const l2 of kids(l1.code, 2)) {
    say(`  L2 ${l2.code} ${l2.name_zh}｜公告=${cnt.get(l2.code) ?? 0}｜L3=${kids(l2.code, 3).length}`);
    say(`       note: ${l2.note}`);
    for (const l3 of kids(l2.code, 3)) {
      say(`    L3 ${l3.code} ${l3.name_zh}｜公告=${cnt.get(l3.code) ?? 0}｜L4=${kids(l3.code, 4).length}`);
      say(`         note: ${l3.note}`);
      for (const l4 of kids(l3.code, 4)) {
        say(`      L4 ${l4.code} [${l4.unspsc_prefix}] ${l4.name_zh}｜公告=${cnt.get(l4.code) ?? 0}｜L5=${L5of(l4.code)}`);
        say(`           en: ${l4.name_en}`);
      }
    }
  }
}

// ── C 族/类覆盖：旧字典 72 段 vs 树 ──
say("\n=== C UNSPSC 72 段字典覆盖（族/类）===");
const dictFam = (await q(
  `SELECT LEFT(code,4) fam, COUNT(*) n FROM crm_unspsc_codes WHERE code LIKE '72%' AND LENGTH(code)=4 GROUP BY LEFT(code,4) ORDER BY fam`,
)) as { fam: string; n: number }[];
const dictCls = (await q(
  `SELECT LEFT(code,6) cls, title_zh FROM crm_unspsc_codes WHERE code LIKE '72%' AND LENGTH(code)=6 ORDER BY code`,
)) as { cls: string; title_zh: string }[];
const treeCls = new Set((byLevel.get(4) ?? []).map((r) => r.unspsc_prefix).filter(Boolean) as string[]);
say(`字典族清单：${dictFam.map((r) => `${r.fam}(${r.n}类)`).join(" ")}`);
for (const f of dictFam) {
  const inTree = (byLevel.get(4) ?? []).filter((r) => (r.unspsc_prefix ?? "").startsWith(f.fam));
  const dictClsOfFam = dictCls.filter((c) => c.cls.startsWith(f.fam));
  const miss = dictClsOfFam.filter((c) => !treeCls.has(c.cls));
  say(`族 ${f.fam}：字典类 ${dictClsOfFam.length} / 树 L4 ${inTree.length} / 缺 ${miss.length}`);
  for (const m of miss) say(`   缺类 ${m.cls} ${m.title_zh}`);
}

// ── D 叶子最多的 L4 的品目清单（Top 8 个 L4，每个最多列 40 叶）──
say("\n=== D 叶子最多的 L4 品目清单 ===");
const top = [...(byLevel.get(4) ?? [])].sort((a, b) => L5of(b.code) - L5of(a.code)).slice(0, 8);
for (const l4 of top) {
  const l3 = (byLevel.get(3) ?? []).find((r) => r.code === l4.parent_code);
  say(`\n[${l4.unspsc_prefix}] ${l4.name_zh}（L3=${l3?.name_zh}，L5=${L5of(l4.code)}，公告=${cnt.get(l4.code) ?? 0}）`);
  for (const l5 of kids(l4.code, 5).slice(0, 40)) {
    say(`   ${l5.unspsc_prefix} ${l5.name_zh}${l5.note ? ` ｜note: ${l5.note}` : ""}`);
  }
}

// ── E 全 32 个大类 L1 一览（判跨类边界用）──
say("\n=== E 各大类 L1 名称与认领段 ===");
const l1all = (await q(
  `SELECT b.code, b.group_code, b.name_zh, b.note FROM crm_commodity_backbone b WHERE b.level=1 ORDER BY b.group_code`,
)) as { code: string; group_code: string; name_zh: string; note: string }[];
for (const r of l1all) say(`${r.group_code} ${r.code} ${r.name_zh}｜${r.note}`);

await conn.end();
writeFileSync(OUT, buf.join("\r\n"), { encoding: "utf8" });
console.log(`written ${buf.length} lines -> ${OUT.pathname}`);

