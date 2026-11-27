/**
 * 层级路径归一的落库：把「末段候选键」现在能解析的公告重建投影。
 *
 * 只做重建，不新建实体、不改 buyer 表——命中的实体都是库里已有的。
 * 用法：npx tsx scripts/tools/apply-buyer-path-rule.ts [--apply]
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { loadBuyerEntityIndex, resolveBuyerEntity } from "../../src/lib/services/buyer/entity-index";
import { refreshBuyerProjection } from "../../src/lib/services/buyer/refresh";
import { syncNoticeIds } from "../../src/lib/services/meilisearch";
import { orgPathSegments } from "../../src/lib/services/buyer/name-variants";

const APPLY = process.argv.includes("--apply");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 3,
});

interface Row extends RowDataPacket {
  notice_pk: number;
  buyer_name: string;
  country_code: string;
}

const [rows] = await pool.query<Row[]>(
  `SELECT notice_pk, TRIM(buyer_name) AS buyer_name, country_code
     FROM notice_public
    WHERE buyer_id IS NULL AND buyer_name LIKE '%>%'`,
);
console.log(`[path] 未匹配路径公告 ${rows.length} 条`);

const index = await loadBuyerEntityIndex(pool);
console.log(`[path] 索引实体 ${index.stats.entities} · 别名 ${index.stats.aliasRows}`);

const hitIds: number[] = [];
const samples: string[] = [];
for (const r of rows) {
  const hit = resolveBuyerEntity(index, r.buyer_name, r.country_code);
  if (!hit) continue;
  hitIds.push(Number(r.notice_pk));
  if (samples.length < 6) {
    const segs = orgPathSegments(r.buyer_name);
    samples.push(`  [${r.country_code}] ${r.buyer_name.slice(0, 62)} → ${hit.canonical}（末段 ${segs[segs.length - 1]}）`);
  }
}
console.log(`[path] 可解析 ${hitIds.length} 条 · 仍不可解析 ${rows.length - hitIds.length} 条`);
console.log("[path] 样例：");
for (const s of samples) console.log(s);

if (!APPLY) {
  console.log("[path] DRY：未写库（加 --apply 生效）");
  await pool.end();
  process.exit(0);
}

if (hitIds.length > 0) {
  const r = await refreshBuyerProjection(pool, { noticeIds: hitIds });
  console.log(`[path] 服务表重建 ${r.rewritten} 条 · 宽表 ${r.wideSynced} 条`);
  const m = await syncNoticeIds(pool, hitIds);
  console.log(`[path] Meili：写入 ${m.synced} · 删除 ${m.deleted}`);
}

const [[after]] = await pool.query<RowDataPacket[]>(
  `SELECT COUNT(*) n FROM notice_public WHERE buyer_id IS NULL AND buyer_name LIKE '%>%'`,
);
console.log(`[path] 剩余未匹配路径公告 ${Number(after.n)} 条`);
await pool.end();
