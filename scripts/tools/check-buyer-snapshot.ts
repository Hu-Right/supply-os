import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadBuyerEntityIndex, resolveBuyerEntity } from "../../src/lib/services/buyer/entity-index";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT)||3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: "utf8mb4", connectionLimit: 2 });
const index = await loadBuyerEntityIndex(pool as never);
const [rows] = await pool.query<any[]>(
  "SELECT notice_pk, buyer_id, buyer_name, country_code FROM notice_public WHERE buyer_id IS NOT NULL ORDER BY notice_pk DESC LIMIT 30000");
let same = 0, diff = 0, miss = 0; const samples: unknown[] = [];
for (const r of rows) {
  const hit = resolveBuyerEntity(index, r.buyer_name, r.country_code);
  if (!hit) { miss += 1; if (samples.length < 6) samples.push({ pk: r.notice_pk, stored: r.buyer_id, name: r.buyer_name, cc: r.country_code, now: "MISS" }); }
  else if (Number(hit.buyerId) === Number(r.buyer_id)) same += 1;
  else { diff += 1; if (samples.length < 6) samples.push({ pk: r.notice_pk, stored: r.buyer_id, now: hit.buyerId, name: r.buyer_name }); }
}
console.log(JSON.stringify({ sampled: rows.length, same, diff, miss, samples }, null, 2));
await pool.end();
