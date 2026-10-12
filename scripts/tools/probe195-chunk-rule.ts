/**
 * 探针195（只读）：验证 L2/L3 的生成规则 —— 是「语义归类」还是「定长分块 + 贪心取名」
 *
 * 判据（可机器复核）：
 *  K1 每个小类的子节点数分布：若大量小类恰好含 8 个子类 ⇒ 定长分块（721510-17 / 18-25 / 26-33 / 34-42 …）；
 *  K2 小类所辖子类前缀是否连续、是否跨族：跨族混装即「切块不顾语义」的直接证据；
 *  K3 父层名是否等于其某个子层名（贪心取名）：统计全树 L2/L3 里「名字=某个孩子的名字」的占比；
 *  K4 G-11 每个小类的子节点码区间（把分块线打出来，供人工核对错位点）。
 *
 * 为什么入库：这是「病灶是规则不是手误」的原始证据（42.6% 小类恰好 8 个子、89.7% 小类名照抄子类名），
 *   也是归位后验收器 A1~A5 判据的来源；不入库则下次重建抽屉时会重踏同一个坑。
 *
 * 用法：node --env-file=.env scripts/tools/probe195-chunk-rule.ts
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const OUT = new URL("../../runtime/commodity-g11-chunk-rule.txt", import.meta.url);
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

type N = { code: string; parent_code: string; level: number; group_code: string; unspsc_prefix: string | null; name_zh: string };
const all = (await q(
  `SELECT code, parent_code, level, group_code, unspsc_prefix, name_zh FROM crm_commodity_backbone WHERE status=1`,
)) as N[];
const kidsOf = new Map<string, N[]>();
for (const r of all) {
  if (!kidsOf.has(r.parent_code)) kidsOf.set(r.parent_code, []);
  kidsOf.get(r.parent_code)!.push(r);
}
const byCode = new Map(all.map((r) => [r.code, r]));

// ── K1 小类（L3）的孩子数分布 ──
const l3s = all.filter((r) => r.level === 3);
const hist = new Map<number, number>();
for (const l3 of l3s) {
  const c = (kidsOf.get(l3.code) ?? []).length;
  hist.set(c, (hist.get(c) ?? 0) + 1);
}
say("=== K1 全树 L3（小类）的直接子节点数分布 ===");
say(`L3 总数=${l3s.length}；分布 ${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}→${v}`).join(" ")}`);
const eight = hist.get(8) ?? 0;
say(`恰好 8 个孩子的 L3 占比 = ${((eight / l3s.length) * 100).toFixed(1)}%`);

// ── K1b 中类（L2）的孩子数分布 ──
const l2s = all.filter((r) => r.level === 2);
const hist2 = new Map<number, number>();
for (const l2 of l2s) {
  const c = (kidsOf.get(l2.code) ?? []).filter((x) => x.level === 3).length;
  hist2.set(c, (hist2.get(c) ?? 0) + 1);
}
say(`\n=== K1b 全树 L2（中类）的 L3 孩子数分布：L2 总数=${l2s.length}；${[...hist2.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}→${v}`).join(" ")}`);

// ── K2 L3 是否跨族（同一小类里出现多个 4 位族前缀）──
let crossFam = 0;
const crossFamList: string[] = [];
for (const l3 of l3s) {
  const fams = new Set((kidsOf.get(l3.code) ?? []).map((r) => (r.unspsc_prefix ?? "").slice(0, 4)).filter(Boolean));
  if (fams.size > 1) {
    crossFam += 1;
    crossFamList.push(`${l3.group_code} ${l3.code} ${l3.name_zh} 跨族 ${[...fams].join(",")}`);
  }
}
say(`\n=== K2 跨 UNSPSC 族的小类数 = ${crossFam}/${l3s.length}（族是标准里的自然归类单位，跨族=人为分块）===`);
for (const s of crossFamList.slice(0, 40)) say(`  ${s}`);

// ── K3 父层名 = 某个子层名（贪心取名）──
const nameOf = (n: N) => n.name_zh.trim();
let l3Copy = 0;
for (const l3 of l3s) {
  const ks = (kidsOf.get(l3.code) ?? []).filter((x) => x.level === 4);
  if (ks.some((k) => nameOf(k) === nameOf(l3))) l3Copy += 1;
}
let l2Copy = 0;
for (const l2 of l2s) {
  const ks = (kidsOf.get(l2.code) ?? []);
  const l3kids = ks.filter((x) => x.level === 3);
  const l4kids = l3kids.flatMap((x) => (kidsOf.get(x.code) ?? []).filter((y) => y.level === 4));
  if ([...ks, ...l4kids].some((k) => nameOf(k) === nameOf(l2))) l2Copy += 1;
}
say(`\n=== K3 取名方式统计 ===`);
say(`L3 名字与其某个 L4 子类同名：${l3Copy}/${l3s.length} = ${((l3Copy / l3s.length) * 100).toFixed(1)}%`);
say(`L2 名字与其某个 L3/L4 后代同名：${l2Copy}/${l2s.length} = ${((l2Copy / l2s.length) * 100).toFixed(1)}%`);

// ── K4 G-11 小类的子类前缀区间（把分块线打出来）──
say("\n=== K4 UGT-G-11 每个小类的子类前缀区间 ===");
for (const l2 of l2s.filter((r) => r.group_code === "UGT-G-11")) {
  say(`L2 ${l2.code} ${l2.name_zh}`);
  for (const l3 of (kidsOf.get(l2.code) ?? []).filter((x) => x.level === 3)) {
    const ps = (kidsOf.get(l3.code) ?? [])
      .filter((x) => x.level === 4)
      .map((x) => x.unspsc_prefix ?? "")
      .sort();
    say(`  L3 ${l3.name_zh}（${ps.length} 子类）：${ps[0]}…${ps[ps.length - 1]}  全序列 ${ps.join(",")}`);
  }
}

// ── K5 每个大类的 L2 数与最大 L2 的占比（失衡度）──
say("\n=== K5 各大类 L2 个数 ===");
const g2 = new Map<string, number>();
for (const l2 of l2s) g2.set(l2.group_code, (g2.get(l2.group_code) ?? 0) + 1);
say([...g2.entries()].sort((a, b) => a[1] - b[1]).map(([g, n]) => `${g}=${n}`).join(" "));
void byCode;

await conn.end();
writeFileSync(OUT, buf.join("\r\n"), { encoding: "utf8" });
console.log(`written ${buf.length} lines`);

