// 只读：排查 dry-run 中 821 条"jsonError"公告的 unspsc_codes 实际形态
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
const noBridge = "NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)";
const hasCodes = "n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'";

const [rows] = await pool.query(
  `SELECT n.id, n.source_channel, n.unspsc_codes
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND ${hasCodes}`
);

const bad = [];
for (const r of rows) {
  let v = r.unspsc_codes;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { bad.push({ ...r, reason: "parse_fail" }); continue; }
  }
  const codes = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x && x.code)).filter(Boolean) : [];
  if (codes.length === 0) bad.push({ id: r.id, ch: r.source_channel, raw: v, reason: Array.isArray(v) ? "empty_codes" : "not_array" });
}

console.log("1.问题公告总数:", bad.length);

const byReason = new Map();
const byCh = new Map();
for (const b of bad) {
  byReason.set(b.reason, (byReason.get(b.reason) || 0) + 1);
  byCh.set(b.ch || "(null)", (byCh.get(b.ch || "(null)") || 0) + 1);
}
console.log("2.按原因:", JSON.stringify([...byReason.entries()]));
console.log("3.按渠道:", JSON.stringify([...byCh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
console.log("4.样本(前6条原始值):");
for (const b of bad.slice(0, 6)) {
  console.log(`   id=${b.id} ch=${b.ch} reason=${b.reason} raw=${JSON.stringify(b.raw).slice(0, 260)}`);
}

// 若是对象形态，看键结构
const objSamples = bad.filter((b) => b.reason === "not_array").slice(0, 3);
for (const s of objSamples) {
  console.log(`5.非数组样本 id=${s.id} keys=${JSON.stringify(Object.keys(s.raw || {}))}`);
}

await pool.end();
