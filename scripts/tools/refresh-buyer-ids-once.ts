import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { refreshBuyerProjection } from "../../src/lib/services/buyer/refresh";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT)||3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: "utf8mb4", connectionLimit: 2 });
const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
if (!ids.length) { console.error("用法: npx tsx scripts/tools/refresh-buyer-ids-once.ts <buyerId...>"); process.exit(1); }
const res = await refreshBuyerProjection(pool, { buyerIds: ids });
console.log(JSON.stringify({ ids, notices: res.noticeIds.length, rewritten: res.rewritten, wideSynced: res.wideSynced }));
await pool.end();
