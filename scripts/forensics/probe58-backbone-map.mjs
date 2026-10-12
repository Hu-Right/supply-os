// 关键测量：公告码 → 新骨架树（crm_commodity_backbone）的挂靠可行性
// 只读。树结构与码域拉到内存里做 JOIN，避免在大表上写函数条件（全表扫）。输出 temp/probe58.txt
//
// 可跑性（入库时注）：第 2 节读 crm_commodity_group_segments（ADR-0009 已退役）、
//   第 7 节读 crm_commodity_nodes（ADR-0006 已退役）⇒ 今天重跑这两段会报错。
//   本件作为 ADR-0009 里「MIN(l1.group_code) 会掩盖一段跨多大类」那条批评的现场留档；
//   正确的可重跑版本是 scripts/forensics/probe-seg-derivable.ts（逐段 COUNT(DISTINCT)）。
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const c = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
const q = async (sql) => (await c.query(sql))[0];
const o = [];
const P = (t) => o.push("\n==== " + t + " ====");

P("0. 新树各层行数 / 带码行数 / 码长分布");
o.push("  " + JSON.stringify(await q(`SELECT level, COUNT(*) 行,
    SUM(unspsc_prefix IS NULL) 无码行, MIN(CHAR_LENGTH(unspsc_prefix)) minp, MAX(CHAR_LENGTH(unspsc_prefix)) maxp
    FROM crm_commodity_backbone GROUP BY level ORDER BY level`)));

P("1. 父子链完整性（parent_code 指向不存在的行 = 断链）");
o.push("  " + JSON.stringify(await q(`
  SELECT b.level, COUNT(*) 行, SUM(p.code IS NULL) 父缺失
    FROM crm_commodity_backbone b LEFT JOIN crm_commodity_backbone p ON p.code = b.parent_code
   GROUP BY b.level ORDER BY b.level`)));

P("2. 段→大类：新树 L4 反推的 L1 与 crm_commodity_group_segments 是否同一份");
o.push("  " + JSON.stringify(await q(`
  SELECT COUNT(*) 段数, SUM(s.group_code IS NULL) 归属表缺, SUM(bb.p IS NULL) 新树推不出,
    SUM(s.group_code IS NOT NULL AND bb.g IS NOT NULL AND s.group_code <> bb.g) 不一致
    FROM crm_commodity_group_segments s
    LEFT JOIN (SELECT LEFT(b.unspsc_prefix,2) p, MIN(l1.group_code) g
                 FROM crm_commodity_backbone b
                 JOIN crm_commodity_backbone l3 ON l3.code = b.parent_code
                 JOIN crm_commodity_backbone l2 ON l2.code = l3.parent_code
                 JOIN crm_commodity_backbone l1 ON l1.code = l2.parent_code
                WHERE b.level = 4 GROUP BY LEFT(b.unspsc_prefix,2)) bb ON bb.p = s.unspsc_prefix`)));

// ── 内存侧 JOIN ──
const nodes = await q(`SELECT code, parent_code, level, group_code, unspsc_prefix FROM crm_commodity_backbone`);
const byCode = new Map(nodes.map((n) => [n.code, n]));
const prefixIdx = new Map(); // unspsc_prefix -> node
const l4BySeg = new Map(); // 2位 -> [L4 node]
const l4ByFam = new Map(); // 4位 -> [L4 node]
const push = (m, k, v) => {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
};
for (const n of nodes) {
  if (n.unspsc_prefix) prefixIdx.set(n.unspsc_prefix, n);
  if (n.level === 4) {
    const p = n.unspsc_prefix;
    if (!p || p.length !== 6) continue;
    push(l4BySeg, p.slice(0, 2), n);
    push(l4ByFam, p.slice(0, 4), n);
  }
}
const ancestorCodes = (n) => {
  const chain = [];
  let cur = n;
  while (cur && cur.parent_code && byCode.get(cur.parent_code)) {
    cur = byCode.get(cur.parent_code);
    chain.push(cur);
  }
  return chain; // [parent, grandparent, ...]
};
const uniq = (arr) => [...new Set(arr)];

const effOf = (code) => {
  if (!/^[0-9]{8}$/.test(code)) return null;
  for (let len = 8; len >= 2; len -= 2) if (code.slice(len - 2, len) !== "00") return code.slice(0, len);
  return null;
};

P("3. 桥表码：有效位分档 × 挂靠方式（等值命中 L5/L4 vs 只能前缀扇出 vs 完全无着）");
const codes = await q(`SELECT code, COUNT(*) 行, COUNT(DISTINCT notice_id) 公告数
    FROM crm_bid_notice_unspsc_codes GROUP BY code`);
const stat = new Map();
const fanoutL2 = [];
const unmatched = [];
for (const r of codes) {
  const eff = effOf(r.code);
  let how, node, setL2 = null;
  if (!eff) how = "码形制非法";
  else if (eff.length === 8) {
    const hit5 = prefixIdx.get(eff);
    if (hit5 && hit5.level === 5) { how = "L5等值"; node = hit5; }
    else if (prefixIdx.get(eff.slice(0, 6))?.level === 4) { how = "品目缺、退到L4子类"; node = prefixIdx.get(eff.slice(0, 6)); }
    else { how = "细码无着(树里无该品目亦无该类)"; unmatched.push([r.code, r.行, r.公告数]); }
  } else if (eff.length === 6) {
    const hit4 = prefixIdx.get(eff);
    if (hit4 && hit4.level === 4) { how = "L4等值"; node = hit4; }
    else { how = "细码无着(树里无该类)"; unmatched.push([r.code, r.行, r.公告数]); }
  } else if (eff.length === 4) {
    const us = l4ByFam.get(eff) ?? [];
    setL2 = uniq(us.map((n) => ancestorCodes(n)[1]?.code));
    how = us.length ? (setL2.length === 1 ? "族扇出→唯一中类" : "族扇出→多中类") : "族无着(L4里没这个族)";
    if (!us.length) unmatched.push([r.code, r.行, r.公告数]);
    else node = us[0];
  } else {
    const us = l4BySeg.get(eff) ?? [];
    const l1s = uniq(us.map((n) => ancestorCodes(n)[2]?.code));
    how = us.length ? (l1s.length === 1 ? "段扇出→唯一大类" : "段扇出→多大类") : "段无着";
    if (!us.length) unmatched.push([r.code, r.行, r.公告数]);
    else node = us[0];
  }
  if (setL2) fanoutL2.push([r.code, setL2.length, r.行]);
  const k = how;
  stat.set(k, (stat.get(k) ?? { 方式: k, 码数: 0, 桥表行: 0, 公告数: 0, 码集合: [] }));
  const s = stat.get(k);
  s.码数++; s.桥表行 += Number(r.行); s.公告数 += Number(r.公告数);
  if (s.码集合.length < 5) s.码集合.push(r.code);
}
o.push("  " + JSON.stringify([...stat.values()].sort((a, b) => b.桥表行 - a.桥表行), null, 0));

P("4. 族级扇出到「中类」的分布（1=唯一归属，>1=一个族码跨多个中类）");
const fanDist = {};
for (const [, k] of fanoutL2) fanDist[k] = (fanDist[k] ?? 0) + 1;
o.push("  扇出中类数分布: " + JSON.stringify(fanDist));
fanoutL2.sort((a, b) => b[1] - a[1]);
o.push("  最大扇出前 10: " + JSON.stringify(fanoutL2.slice(0, 10)));

P("5. 完全无着的细码（树里既无 8 位 L5 也无 6 位 L4）—— 迁移后必须显式标记，不能静默丢");
o.push("  数量: " + unmatched.length + " 码 / " + unmatched.reduce((a, b) => a + b[1], 0) + " 行");
o.push("  样本: " + JSON.stringify(unmatched.slice(0, 15)));

P("6. 公告维度：每公告「最深可承接层」分布（挂靠结果的颗粒度）");
const notices = await q(`SELECT notice_id,
    MAX(CASE WHEN RIGHT(code,6)<>'000000' AND RIGHT(code,2)<>'00' THEN 8
             WHEN RIGHT(code,2)='00' AND RIGHT(code,4)<>'0000' THEN 6
             WHEN RIGHT(code,4)='0000' AND RIGHT(code,6)<>'000000' THEN 4 ELSE 2 END) deepest,
    COUNT(*) 码数 FROM crm_bid_notice_unspsc_codes GROUP BY notice_id`);
const byDeepest = {};
for (const n of notices) byDeepest[n.deepest] = (byDeepest[n.deepest] ?? 0) + 1;
o.push("  公告数按最深有效位: " + JSON.stringify(byDeepest) + " 共 " + notices.length + " 公告");

P("7. 原树 crm_commodity_nodes 码域 vs 新树 unspsc_prefix 码域");
o.push("  " + JSON.stringify(await q(`
  SELECT (SELECT COUNT(DISTINCT unspsc_code) FROM crm_commodity_nodes WHERE unspsc_code IS NOT NULL) 原树码,
         (SELECT COUNT(DISTINCT unspsc_prefix) FROM crm_commodity_backbone WHERE unspsc_prefix IS NOT NULL) 新树前缀,
         (SELECT COUNT(*) FROM crm_commodity_nodes n WHERE n.unspsc_code IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM crm_commodity_backbone b WHERE b.unspsc_prefix = LEFT(n.unspsc_code,8))) 原树码新树无对应L5`)));

P("8. 宽表现状（code_path/group_codes 空率与最大列长）");
o.push("  " + JSON.stringify(await q(`SELECT COUNT(*) 行,
    SUM(code_path IS NULL OR code_path='') 空code_path,
    SUM(group_codes IS NULL OR group_codes='') 空group_codes,
    MAX(CHAR_LENGTH(code_path)) max_len FROM crm_notice_search`)));

writeFileSync(new URL("./probe58.txt", import.meta.url), o.join("\n"), "utf8");
console.log("written temp/probe58.txt");
await c.end();
