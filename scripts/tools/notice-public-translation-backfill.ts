/**
 * 中文译文回填服务表 —— 一次性补齐「翻译表有、服务表没有」的存量缺口。
 *
 * 背景（2026-11-26）：后台翻译器（intelligence-daily）只写 `notice_translations`
 * （并直更宽表 title_zh），从不写 `notice_public.title_cn/description_cn`，
 * 导致门户上「搜得到中文、点进去是外文」。应用内增量已由
 * `rebuildNoticePublicChanged` 的译文水位承接；本脚本只处理存量。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-translation-backfill.ts            # DRY：只报缺口
 *   npx tsx scripts/tools/notice-public-translation-backfill.ts --apply    # 真正回填
 *   npx tsx scripts/tools/notice-public-translation-backfill.ts --apply --limit=5000
 *
 * 口径：只回填「有非空中文译文、但服务表 title_cn 为空」的行；重建走 build.ts
 *      唯一写入者（不直接 UPDATE 服务表），因此 buyer/国家/金额等归一值一并刷新。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import {
  buildPublicRow,
  fetchPublicInputRows,
  loadPublicBuildContext,
  upsertPublicRows,
} from "../../src/lib/services/notice-public/build";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length)) || Infinity;
const CHUNK = 500;

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 3,
});

/** 缺口选行：服务表 title_cn 为空，但翻译表有非空中文标题/正文 */
const GAP_WHERE = `
  (p.title_cn IS NULL OR p.title_cn = '')
  AND ((t.title_tr IS NOT NULL AND t.title_tr <> '')
    OR (t.description_tr IS NOT NULL AND t.description_tr <> ''))`;

async function count(where: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM notice_public p
       JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'zh'
      WHERE ${where}`,
    params,
  );
  return Number(rows[0]?.n ?? 0);
}

const before = await count(GAP_WHERE);
const total = await pool.query<RowDataPacket[]>(
  "SELECT COUNT(*) AS n FROM notice_public WHERE title_cn IS NOT NULL AND title_cn <> ''",
);
console.log(`缺口：${before} 条（服务表现有中文标题 ${total[0][0]?.n ?? 0} 条）`);
if (!APPLY) {
  console.log("DRY：加 --apply 才写库");
  await pool.end();
  process.exit(0);
}

const ctx = await loadPublicBuildContext(pool);
let lastPk = 0;
let scanned = 0;
let written = 0;
let failed = 0;
const t0 = Date.now();

while (scanned < LIMIT) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.notice_pk AS id
       FROM notice_public p
       JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'zh'
      WHERE ${GAP_WHERE}
        AND p.notice_pk > ?
      ORDER BY p.notice_pk ASC
      LIMIT ?`,
    [lastPk, CHUNK],
  );
  if (rows.length === 0) break;
  const ids = rows.map((r) => Number(r.id));
  lastPk = ids[ids.length - 1];
  scanned += ids.length;

  const input = await fetchPublicInputRows(pool, ids);
  const params: unknown[][] = [];
  for (const r of input.rows) {
    const row = buildPublicRow(r, ctx, input);
    if (row) params.push(row);
  }
  try {
    written += await upsertPublicRows(pool, params);
  } catch (err) {
    failed += ids.length;
    console.error(`[backfill] 批次失败 pk>${lastPk}: ${(err as Error).message}`);
  }
  if (scanned % 5000 < CHUNK) {
    console.log(`[backfill] 扫描 ${scanned} · 写入 ${written} · 失败 ${failed} · 游标 ${lastPk}`);
  }
  if (ids.length < CHUNK) break;
}

const after = await count(GAP_WHERE);
const withCn = await pool.query<RowDataPacket[]>(
  "SELECT COUNT(*) AS n FROM notice_public WHERE title_cn IS NOT NULL AND title_cn <> ''",
);
console.log(
  `完成：扫描 ${scanned} · 写入 ${written}（${((Date.now() - t0) / 1000).toFixed(1)}s）· ` +
    `剩余缺口 ${after} · 中文标题 ${withCn[0][0]?.n ?? 0} 条`,
);
await pool.end();
