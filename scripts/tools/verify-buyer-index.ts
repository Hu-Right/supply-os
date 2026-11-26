import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadBuyerEntityIndex, resolveBuyerEntity } from "../../src/lib/services/buyer/entity-index";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4", connectionLimit: 2,
});
const index = await loadBuyerEntityIndex(pool as never);
const [buyers] = await pool.query<any[]>("SELECT buyer_id, canonical_name, country_code FROM buyer WHERE status='active'");
let miss = 0, wrong = 0; const samples: unknown[] = [];
for (const b of buyers) {
  const hit = resolveBuyerEntity(index, b.canonical_name, b.country_code);
  if (!hit) { miss += 1; if (samples.length < 5) samples.push({ id: b.buyer_id, name: b.canonical_name, cc: b.country_code, why: "MISS" }); }
  else if (Number(hit.buyerId) !== Number(b.buyer_id)) { wrong += 1; if (samples.length < 5) samples.push({ id: b.buyer_id, hit: hit.buyerId, name: b.canonical_name }); }
}
const [aliases] = await pool.query<any[]>("SELECT alias_key, alias, country_code, buyer_id FROM buyer_alias");
let aMiss = 0, aWrong = 0;
for (const a of aliases) {
  const hit = resolveBuyerEntity(index, a.alias, a.country_code);
  if (!hit) aMiss += 1;
  else if (Number(hit.buyerId) !== Number(a.buyer_id)) aWrong += 1;
}
console.log(JSON.stringify({ index: index.stats, activeBuyers: buyers.length, canonicalMiss: miss, canonicalWrong: wrong, aliasRows: aliases.length, aliasMiss: aMiss, aliasWrong: aWrong, samples }, null, 2));
await pool.end();
