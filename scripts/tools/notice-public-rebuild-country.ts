/**
 * 定向服务表重建（国家维度）：刷新两类「表驱动画风变化后未跟上」的行。
 *
 * ① 受援国英文残留：beneficiary_countries 在 country_aliases zh 种子（2026-10-19）
 *    入表前构建，解析失败回退原始英文串（Philippines/South Africa...）；表 zh 已 100%，
 *    重建即出中文。选行：beneficiary 纯拉丁串。
 * ② 无国家码行：country_code 为空但主表 raw country 非空——含 zh 中文国名未注册别名
 *    的行（塞尔维亚等，别名批次 20261030 已补）与多国区域项目（Multiple destinations/
 *    Regional...，语义上无单一国家，重建后仍为空码，属设计内）。选行：country_code 空。
 *
 * 写链复用 build.ts 唯一写入者。用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/notice-public-rebuild-country.ts            # DRY
 *   npx tsx scripts/tools/notice-public-rebuild-country.ts --apply
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
    `SELECT id FROM (
       SELECT p.notice_pk AS id FROM notice_public p
        WHERE p.beneficiary_countries IS NOT NULL AND p.beneficiary_countries <> ''
          AND p.beneficiary_countries NOT REGEXP '[一-龥]'
       UNION
       SELECT p.notice_pk AS id
         FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
        WHERE (p.country_code IS NULL OR p.country_code = '')
          AND n.country IS NOT NULL AND n.country <> ''
     ) u ORDER BY id`,
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.id));
  console.log(`[rebuild-country] 圈中 ${ids.length} 行（选行 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  if (!APPLY) {
    console.log("[rebuild-country] DRY：加 --apply 才写服务表");
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
          console.error(`[rebuild-country] 单行写入失败（notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[rebuild-country] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
    if ((i / CHUNK) % 10 === 9) {
      console.log(`[rebuild-country] 进度 ${i + chunk.length}/${ids.length} · 已写 ${written}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
    }
  }
  console.log(`[rebuild-country] 重建完成：圈中 ${ids.length} · 写入 ${written} · 总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await pool.end();
}
