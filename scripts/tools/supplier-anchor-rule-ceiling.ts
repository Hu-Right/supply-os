/**
 * 只读预演：供应商侧「规则层能白拿多少品目锚」+「补锚能把可撮合品目从 29 推到多少」
 *
 * 为什么要跑它：2026-10-19 实测公告侧打标管道再顺，可撮合品目也只有 29 个（公告≥5 且 供应商≥3），
 * 因为供应侧总共才 703 个节点挂着。短板在供给侧，而供给侧有 6 万多家的 products 自由文本没锚。
 * 本脚本用**公告侧同一套 name-matcher**（不新造判据）量一下：这些 products 文本能整串命中多少唯一节点，
 * 以及命中之后能新增多少个"双边都有货"的品目。零成本、不调任何 API、不写库。
 *
 * 用法：npx tsx scripts/tools/supplier-anchor-rule-ceiling.ts [--cap=0] [--products-only]
 *
 * 除规则上限外，还量「可达性阱门」：站内推荐不限认证，但 RFQ 邮件邀约只给
 * verified+有邮箱的供应商，所以补锚的即时收益 = 可补锚 ∩ verified（第 6 节）。
 *
 * @limits 只读：对 supplier / crm_supplier_backbone_interests / 落点表 / 骨架表只发 SELECT。
 *         锚表按 (supplier_table, supplier_id) 复合键定位 —— 只用 supplier_id 会把两张供应商表的
 *         同号 id 混成一个，那个数就是错的（本次一并修正口径）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  ATTR_LANDING_TABLE,
  ATTR_VALID_MIN_CODE_LEN,
} from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { buildNameIndex, judgeRuleHits, type NameHit } from "../../src/lib/services/commodity/name-matcher";

const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const argNum = (flag: string, d: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? Number(hit.slice(flag.length + 3)) : d;
};
const CAP = argNum("cap", 0); // 0 = 全量
const PRODUCTS_ONLY = process.argv.includes("--products-only");
const MIN_LEVEL = argNum("min-level", 2);

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> =>
  ((await conn.query(`/*+ MAX_EXECUTION_TIME(180000) */ ${sql}`, p))[0]) as unknown as T[];
const out: string[] = [];
const say = (s: string) => out.push(s);

// ── 1. 锚表的 supplier_table 取值域（不猜）──
const doms = await q<{ t: string; n: number; sup: number }>(
  `SELECT supplier_table t, COUNT(*) n, COUNT(DISTINCT CONCAT(supplier_table,':',supplier_id)) sup
     FROM crm_supplier_backbone_interests GROUP BY supplier_table ORDER BY n DESC`,
);
say(`锚表 supplier_table 取值域：`);
for (const d of doms) say(`  ${d.t}：${d.n} 行 / ${d.sup} 家`);
const SUP_TABLE = doms[0]?.t ?? "supplier";

// ── 2. 已锚集合（复合键）──
const anchored = await q<{ k: number }>(
  `SELECT DISTINCT supplier_id k FROM crm_supplier_backbone_interests WHERE supplier_table = ?`,
  [SUP_TABLE],
);
const anchoredSet = new Set(anchored.map((r) => Number(r.k)));
say(`\n已锚（${SUP_TABLE} 域）：${anchoredSet.size} 家`);

// ── 3. 词表：骨架树自身（与公告侧同一份实现）──
const nameRows = await q<{ code: string; nameZh: string; nameEn: string }>(
  `SELECT code, name_zh AS nameZh, name_en AS nameEn FROM crm_commodity_backbone WHERE status=1 ORDER BY code`,
);
const index = buildNameIndex(nameRows);
say(`词表：${index.nodes} 节点 → ${index.size} 条整串名`);

// ── 4. 公告侧活跃有效落点节点（决定"补了锚能不能立刻撮合"）──
const noticeNodes = await q<{ code: string; na: number }>(
  `SELECT a.node_code code, COUNT(DISTINCT a.notice_pk) na FROM \`${ATTR_LANDING_TABLE}\` a
     JOIN crm_bid_notices n ON n.id = a.notice_pk
    WHERE ${ACTIVE_NOTICE_WHERE} AND LENGTH(a.node_code) >= ${ATTR_VALID_MIN_CODE_LEN}
    GROUP BY a.node_code`,
);
const noticeMap = new Map(noticeNodes.map((r) => [r.code, Number(r.na)]));
const supPerNode = new Map<string, number>();
for (const r of await q<{ code: string; k: string; n: number }>(
  `SELECT code, supplier_table k, COUNT(DISTINCT supplier_id) n FROM crm_supplier_backbone_interests GROUP BY code, supplier_table`,
)) {
  supPerNode.set(r.code, (supPerNode.get(r.code) ?? 0) + Number(r.n));
}
say(`公告侧活跃有效落点节点：${noticeMap.size}｜供应侧已挂节点：${supPerNode.size}`);

// ── 5. 全量扫未锚供应商 ──
type Stat = { none: number; single: number; ambiguous: number; coarse: number };
const st: Stat = { none: 0, single: 0, ambiguous: 0, coarse: 0 };
const hitSup = new Map<string, number>(); // 节点 → 命中它的未锚供应商数
const hitIds = new Set<number>(); // 可直落的供应商 id（第 6 节算可达交集要用个体，不能只看节点计数）
const samples: string[] = ["verdict\tcompany\tproducts\thit_code\tlevel\tevidence"];
let scanned = 0;
let lastId = 0;
for (;;) {
  const want = CAP > 0 ? Math.min(2000, CAP - scanned) : 2000;
  if (want <= 0) break;
  const list = await q<{ id: number; company: string; products: string; industry: string | null }>(
    `SELECT id, company, products, industry_code industry FROM supplier
      WHERE id > ? AND products IS NOT NULL AND CHAR_LENGTH(TRIM(products)) >= 4
      ORDER BY id LIMIT ${want}`,
    [lastId],
  );
  if (list.length === 0) break;
  for (const r of list) {
    lastId = Number(r.id);
    if (anchoredSet.has(Number(r.id))) continue;
    scanned++;
    const text = PRODUCTS_ONLY ? String(r.products) : `${r.products} ${r.company ?? ""}`;
    const v = judgeRuleHits(index.hitCodes(text), MIN_LEVEL);
    if (v.state === "none") st.none++;
    else if (v.state === "ambiguous-branch") st.ambiguous++;
    else if (v.state === "too-coarse") st.coarse++;
    else {
      st.single++;
      hitIds.add(Number(r.id));
      const code = v.code ?? "";
      hitSup.set(code, (hitSup.get(code) ?? 0) + 1);
      if (samples.length <= 40) {
        samples.push(
          ["single", JSON.stringify(String(r.company).slice(0, 40)), JSON.stringify(String(r.products).slice(0, 80)), code, v.level, JSON.stringify((v.hits as NameHit[]).map((h) => `${h.lang}:${h.name}`).join("|"))].join("\t"),
        );
      }
    }
  }
  if (scanned % 20000 === 0) process.stdout.write(`\r已扫 ${scanned} 家…`);
}
console.log();
const pct = (x: number) => `${((x / Math.max(1, scanned)) * 100).toFixed(1)}%`;
say(`\n=== 规则层对供应侧（未锚且有 products 文本，实扫 ${scanned} 家，min-level=L${MIN_LEVEL}${PRODUCTS_ONLY ? "，仅 products" : "，products+公司名"}）===`);
say(`可直落单一节点：${st.single} = ${pct(st.single)}｜多分支歧义 ${st.ambiguous} = ${pct(st.ambiguous)}｜只到粗类 ${st.coarse}｜无整串命中 ${st.none} = ${pct(st.none)}`);

// ── 6. 补锚之后，可撮合品目能到多少（上界估算，不含 AI/人工）──
let newNode = 0;
let newReady1 = 0;
let newReady5x3 = 0;
const addedNodes: Array<[string, number, number]> = [];
for (const [code, ns] of hitSup) {
  const na = noticeMap.get(code) ?? 0;
  const totalSup = ns + (supPerNode.get(code) ?? 0);
  const was = na > 0 && (supPerNode.get(code) ?? 0) > 0;
  if (!was && na > 0) {
    newNode++;
    addedNodes.push([code, na, totalSup]);
    if (na >= 1 && totalSup >= 1) newReady1++;
    if (na >= 5 && totalSup >= 3) newReady5x3++;
  } else if (was && na >= 5 && (supPerNode.get(code) ?? 0) < 3 && totalSup >= 3) {
    newReady5x3++; // 已有交集但供应不足 3 家，补锚后升档
  }
}
const baseInter = [...supPerNode.keys()].filter((c) => noticeMap.has(c)).length;
const baseReady = [...supPerNode.keys()].filter((c) => (noticeMap.get(c) ?? 0) >= 5 && (supPerNode.get(c) ?? 0) >= 3).length;
say(`\n=== 撮合面（只看规则层这一档，AI/人工未计）===`);
say(`当前交集节点 ${baseInter}｜当前「公告≥5 且 供应商≥3」= ${baseReady}`);
say(`规则层补锚后：新增有公告承载的节点 ${newNode} 个；其中凑够「≥5 且 ≥3」的 +${newReady5x3} ⇒ 约 ${baseReady + newReady5x3} 个`);
say(`  新增节点里公告最厚 Top10：${addedNodes.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, na, ns]) => `${c}(告${na}/供${ns})`).join(" ")}`);
say(`  命中节点集中度：${[...hitSup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `${c}×${n}`).join(" ")}`);

// ── 6. 可达性阱门（选起点的关键：锚不是唯一门槛）──
// 撮合两个消费端门槛不一样：站内推荐（ai-match）的候选池由调用方给、不限认证；
// RFQ 邮件邀约 matchSuppliers() 硬要求 crm_users.supplier_link_status='verified' 且有邮箱，
// 并且先只取 300 家地域候选再做类目交集（CANDIDATE_POOL）。
// ⇒ 补锚对“邮件触达”的即时收益 = 可补锚 ∩ verified。这个数不量就会把话讲大。
const reachable = new Set(
  (
    await q<{ sid: number }>(
      `SELECT DISTINCT supplier_id sid FROM crm_users
        WHERE supplier_link_status = 'verified' AND supplier_id IS NOT NULL
          AND email IS NOT NULL AND email <> ''
          AND (account_status IS NULL OR (account_status <> 'disabled' AND account_status <> 'rejected'))`,
    )
  ).map((r) => Number(r.sid)),
);
say(`\n=== 可达性阱门 ===`);
const supTotal = Number((await q<{ n: number }>(`SELECT COUNT(*) n FROM supplier`))[0].n);
say(`verified 且有邮箱、账号未禁的供应商：${reachable.size} 家（全量 supplier ${supTotal} 家 ⇒ ${((reachable.size / supTotal) * 100).toFixed(2)}%）`);
say(`  已锚 ${anchoredSet.size} 家里可达：${[...anchoredSet].filter((id) => reachable.has(id)).length} 家`);
say(`  规则可补锚 ${hitIds.size} 家里可达：${[...hitIds].filter((id) => reachable.has(id)).length} 家 —— 邮件邀约能立刻用上的量`);
say(`  两边都不可达时，补锚只增强站内推荐（ai-match 候选不限认证），不会增加邮件触达`);

writeFileSync("runtime/supplier-anchor-sample.tsv", samples.join("\n") + "\n", "utf8");
say(`\n✓ 人工判读样本 → runtime/supplier-anchor-sample.tsv（公司名 + products 原文 + 命中码 + 证据名）`);
writeFileSync(`runtime/supplier-anchor-ceiling-${STAMP}.txt`, out.join("\n") + "\n", "utf8");
console.log(out.join("\n"));
await conn.end();
