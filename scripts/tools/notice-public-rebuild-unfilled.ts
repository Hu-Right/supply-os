/**
 * 泛化服务表重建：只重建「buyer_name_cn 为空且其买家已有可用中文」的行——
 * 翻译落表后把服务表已有行的 buyer_name_cn 刷新出来。没有中文可落的长尾行不进
 * 选集（重建它们毫无产出），避免无谓负载。
 *
 * 选行：notice_public.cn 为空 AND EXISTS(buyer_translation.sha_key(UPPER(TRIM(buyer_name)))
 *       且 zh 非空且 translated)。注意构建时查表键是 TRIM(buyer_name) 区分大小写，
 *       个别大小写不一致的行重建后仍为空（占比极小，见批次报告）。
 *
 * 用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/notice-public-rebuild-unfilled.ts            # DRY：只报圈中行数
 *   npx tsx scripts/tools/notice-public-rebuild-unfilled.ts --apply    # 重建
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
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

try {
  const t0 = Date.now();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.notice_pk AS id
       FROM notice_public p
      WHERE p.buyer_name IS NOT NULL AND p.buyer_name <> ''
        AND (p.buyer_name_cn IS NULL OR p.buyer_name_cn = '')
        AND EXISTS (
          SELECT 1 FROM buyer_translation bt
           WHERE bt.buyer_key = SHA2(UPPER(TRIM(p.buyer_name)), 256)
             AND bt.buyer_name_zh IS NOT NULL AND bt.buyer_name_zh <> ''
             AND bt.status = 'translated')
      ORDER BY p.notice_pk`,
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.notice_pk ?? r.id));
  console.log(`[rebuild-unfilled] 圈中 ${ids.length} 行（选行 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  if (!APPLY) {
    console.log("[rebuild-unfilled] DRY：加 --apply 才写服务表");
    process.exit(0);
  }
  const ctx = await loadPublicBuildContext(pool);
  let written = 0;
  let stillEmpty = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const input = await fetchPublicInputRows(pool, chunk);
    const params: unknown[][] = [];
    for (const r of input.rows) {
      const row = buildPublicRow(r, ctx, input);
      if (row) params.push(row);
    }
    try {
      written += await upsertPublicRows(pool, params);
    } catch (chunkErr) {
      for (const row of params) {
        try {
          written += await upsertPublicRows(pool, [row]);
        } catch (rowErr) {
          console.error(`[rebuild-unfilled] 单行写入失败（notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[rebuild-unfilled] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
    if ((i / CHUNK) % 40 === 39) {
      console.log(`[rebuild-unfilled] 进度 ${i + chunk.length}/${ids.length} · 已写 ${written}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
    }
  }
  // 复核：圈中行里仍空中文的（大小写不一致等）
  const [left] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM notice_public p
      WHERE p.notice_pk IN (${ids.slice(0, 5000).map(() => "?").join(",")})
        AND (p.buyer_name_cn IS NULL OR p.buyer_name_cn = '')`,
    ids.slice(0, 5000),
  );
  stillEmpty = Number((left as RowDataPacket[])[0]?.c ?? 0);
  console.log(`[rebuild-unfilled] 重建完成：圈中 ${ids.length} · 写入 ${written} · 前5000行复核空中文 ${stillEmpty} · 总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await pool.end();
}
