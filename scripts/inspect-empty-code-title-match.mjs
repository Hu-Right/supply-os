// 只读：821 条"有 description 无 code"的公告，其 description 能否精确匹配类目标题
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const [tree] = await pool.query("SELECT id, code, level, title, title_zh FROM crm_unspsc_codes");
const byTitle = new Map();
for (const t of tree) {
  const k = norm(t.title);
  if (k && !byTitle.has(k)) byTitle.set(k, t);
}
console.log(`0.类目标题索引 ${byTitle.size} 个（总节点 ${tree.length}）`);

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
const noBridge = "NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)";
const hasCodes = "n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'";

const [rows] = await pool.query(
  `SELECT n.id, n.source_channel, n.unspsc_codes FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND ${hasCodes}`
);

const stats = { notices: 0, emptyArray: 0, descOnly: 0, matched: 0, unmatched: 0 };
const matchLevel = new Map();
const unmatchedDesc = new Map();

for (const r of rows) {
  let v = r.unspsc_codes;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { continue; } }
  if (!Array.isArray(v)) continue;
  const codes = v.map((x) => (typeof x === "string" ? x : x && x.code)).filter(Boolean);
  if (codes.length > 0) continue;
  stats.notices++;
  if (v.length === 0) { stats.emptyArray++; continue; }
  stats.descOnly++;

  let hit = false;
  for (const item of v) {
    const d = norm(item && (item.description || item.title || item.name));
    if (!d) continue;
    const node = byTitle.get(d);
    if (node) {
      hit = true;
      matchLevel.set(node.level, (matchLevel.get(node.level) || 0) + 1);
    } else {
      unmatchedDesc.set(d, (unmatchedDesc.get(d) || 0) + 1);
    }
  }
  if (hit) stats.matched++; else stats.unmatched++;
}

console.log("1.统计:", JSON.stringify(stats));
console.log("2.命中节点的 level 分布:", JSON.stringify([...matchLevel.entries()].sort()));
console.log("3.未命中 description TOP15:",
  JSON.stringify([...unmatchedDesc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)));

await pool.end();
