/**
 * 定向服务表重建（中文正文维度）：description_cn 取值链接入翻译旁表
 * description_tr（2026-10-30）后，刷新「服务表无中文正文但翻译旁表有」的行。
 *
 * 选行：notice_public.description_cn 为空 AND EXISTS notice_translations(lang='zh',
 *       description_tr 非空)。商机运营中文优先级更高，不受影响（那类行 description_cn 非空）。
 *
 * 写链复用 build.ts 唯一写入者。用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/notice-public-rebuild-desc-cn.ts            # DRY
 *   npx tsx scripts/tools/notice-public-rebuild-desc-cn.ts --apply
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
       JOIN notice_translations tr ON tr.notice_id = p.notice_pk AND tr.lang = 'zh'
      WHERE (p.description_cn IS NULL OR p.description_cn = '')
        AND CHAR_LENGTH(TRIM(COALESCE(tr.description_tr, ''))) > 0
      ORDER BY p.notice_pk`,
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.id));
  console.log(`[rebuild-desc-cn] 圈中 ${ids.length} 行（选行 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  if (!APPLY) {
    console.log("[rebuild-desc-cn] DRY：加 --apply 才写服务表");
    process.exit(0);
  }
  const ctx = await loadPublicBuildContext(pool);
  let written = 0;
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
          console.error(`[rebuild-desc-cn] 单行写入失败（notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[rebuild-desc-cn] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
  }
  console.log(`[rebuild-desc-cn] 重建完成：圈中 ${ids.length} · 写入 ${written} · 总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await pool.end();
}
