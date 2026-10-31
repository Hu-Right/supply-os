/**
 * 服务表中文名同步重建：把 notice_public.buyer_name_cn 追平实体权威名 buyer.name_zh。
 *
 * 为什么存在：--changed 水位（selectChangedPublicIds）只看主表/商机/标题旁表，
 * 买家改名不会重选已有服务表行 —— 于是 buyer.name_zh 已经修好，列表页与详情页
 * 仍投影旧的半译名。本脚本用自维护谓词圈出「投影 ≠ 权威名」的全部行，
 * 走唯一写入者链路（fetchPublicInputRows → buildPublicRow → upsertPublicRows）重建，
 * 不直接 UPDATE 服务表（红线 N1：notice_public 只能由 builder 写）。
 *
 * 与 notice-public-rebuild-buyers.ts 的区别：那个用硬编码买家名单一次性兜底，
 * 本脚本按数据自身对账，可反复运行且无需维护名单。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-rebuild-names.ts           # DRY：只报圈中行数与样本
 *   npx tsx scripts/tools/notice-public-rebuild-names.ts --apply   # 真正写服务表
 *   可选 --limit=N 只处理前 N 行（分批放量用）
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  buildPublicRow, fetchPublicInputRows, loadPublicBuildContext, upsertPublicRows,
} from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 0);
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

// 谓词：实体有权威中文名，而服务表投影与它不一致（含服务表为空）
const STALE = `
  SELECT p.notice_pk, p.buyer_name_cn AS projected, b.name_zh AS authority
    FROM notice_public p
    JOIN buyer b ON b.buyer_id = p.buyer_id
   WHERE b.name_zh IS NOT NULL AND b.name_zh <> ''
     AND COALESCE(p.buyer_name_cn, '') <> b.name_zh
   ORDER BY p.notice_pk${LIMIT > 0 ? ` LIMIT ${LIMIT}` : ""}`;

try {
  const [rows] = await pool.query(STALE);
  const hits = rows as RowDataPacket[];
  const ids = hits.map((r) => Number(r.notice_pk));
  console.log(`[rebuild-names] 圈中「投影≠权威名」${ids.length} 行${LIMIT ? `（--limit=${LIMIT}）` : ""}`);
  for (const r of hits.slice(0, 8)) {
    console.log(`  notice_pk=${r.notice_pk} 现投影=[${r.projected ?? "NULL"}] → 权威=[${r.authority}]`);
  }
  if (!APPLY) {
    console.log("[rebuild-names] DRY：加 --apply 才写服务表");
    process.exit(0);
  }
  const ctx = await loadPublicBuildContext(pool);
  let written = 0;
  let failed = 0;
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
      // 与 rebuild.ts 同款降级：单行坏数据不得毒化整块
      for (const row of params) {
        try {
          written += await upsertPublicRows(pool, [row]);
        } catch (rowErr) {
          failed += 1;
          console.error(`[rebuild-names] 单行写入失败（已隔离，notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[rebuild-names] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
    console.log(`  进度 ${Math.min(i + CHUNK, ids.length)}/${ids.length} · 已写 ${written}`);
  }
  console.log(`[rebuild-names] 完成：圈中 ${ids.length} · 写入 ${written} · 单行失败 ${failed}`);
} finally {
  await pool.end();
}
