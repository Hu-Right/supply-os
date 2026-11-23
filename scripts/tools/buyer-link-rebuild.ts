/**
 * 别名补齐后重建未匹配公告的买家投影（单次装载上下文，批量重建）
 *
 * @module scripts/tools/buyer-link-rebuild
 * @description buyer-normalize-repair 补了 4.5k 条 alias 后，历史 notice_public 行仍是
 *              buyer_id=NULL；本脚本按 alias_key 反查这些公告，走唯一写入者链路
 *              （fetchPublicInputRows → buildPublicRow → upsertPublicRows）重算。
 *
 *              注意：不要按 200 条循环调用 rebuildPublicRowsByIds——它每次都会
 *              loadPublicBuildContext（11 万 buyer + 12 万 alias），15k 行会把重建拖成小时级。
 *
 * 用法：
 *   npx tsx scripts/tools/buyer-link-rebuild.ts            # DRY：只数
 *   npx tsx scripts/tools/buyer-link-rebuild.ts --apply    # 重建
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  buildPublicRow, fetchPublicInputRows, loadPublicBuildContext, upsertPublicRows,
} from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const CHUNK = 500;

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
  connectionLimit: 2,
});

(async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT p.notice_pk
       FROM notice_public p
       JOIN bid_notices n ON n.id = p.notice_pk
      WHERE p.buyer_id IS NULL
        AND (
          EXISTS (SELECT 1 FROM buyer_alias a
                   WHERE a.alias_key = SHA2(CONCAT(COALESCE(p.country_code,''),'|',TRIM(n.agency_full)), 256))
          OR EXISTS (SELECT 1 FROM buyer_alias a
                      WHERE a.alias_key = SHA2(CONCAT(COALESCE(p.country_code,''),'|',TRIM(n.organization)), 256))
        )`,
  );
  const ids = rows.map((r) => Number(r.notice_pk));
  console.log(`[link-rebuild] notice_ids=${ids.length}${APPLY ? "" : " (dry)"}`);
  if (!APPLY) { await pool.end(); return; }

  const t0 = Date.now();
  const ctx = await loadPublicBuildContext(pool);
  let written = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const batch = await fetchPublicInputRows(pool, chunk);
    const params: unknown[][] = [];
    for (const row of batch.rows) {
      const p = buildPublicRow(row, ctx, batch);
      if (p) params.push(p);
    }
    written += await upsertPublicRows(pool, params);
    if ((i / CHUNK) % 10 === 0) {
      console.log(`[link-rebuild] ${Math.min(i + CHUNK, ids.length)}/${ids.length} written=${written} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  console.log(`[link-rebuild] done written=${written} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
