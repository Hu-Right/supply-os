/**
 * 定向服务表重建（行业维度）：industry 列受控词表化（2026-10-30）后，
 * 刷新「列值不在 canonical 全集」的历史行——中文同义标签映射、变体合并、
 * 旧字典残码/字母残片置 NULL。选行在 SQL 端用 canonical 全集字面量。
 *
 * 写链复用 build.ts 唯一写入者。用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/notice-public-rebuild-industry.ts            # DRY
 *   npx tsx scripts/tools/notice-public-rebuild-industry.ts --apply
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { INDUSTRY_CANONICALS } from "../../src/lib/services/notice-normalize/industry";
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
  const placeholders = INDUSTRY_CANONICALS.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT notice_pk FROM notice_public
      WHERE industry IS NOT NULL AND industry <> ''
        AND LOWER(TRIM(industry)) NOT IN (${placeholders})
      ORDER BY notice_pk`,
    [...INDUSTRY_CANONICALS],
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.notice_pk));
  console.log(`[rebuild-industry] 圈中 ${ids.length} 行（canonical ${INDUSTRY_CANONICALS.length} 个；选行 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  if (!APPLY) {
    console.log("[rebuild-industry] DRY：加 --apply 才写服务表");
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
          console.error(`[rebuild-industry] 单行写入失败（notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[rebuild-industry] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
  }
  console.log(`[rebuild-industry] 重建完成：圈中 ${ids.length} · 写入 ${written} · 总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await pool.end();
}
