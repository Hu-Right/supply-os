/**
 * 服务表 updated_at 脏值修复 —— 把 `YYYYMMDDHHMMSS` 形态写进的行重建为合法水位。
 *
 * 背景（2026-11-26）：主表 `bid_notices.update_time` 有 83 行是 `20261030012753` 形态，
 * 构建期原样写进 `notice_public.updated_at`（84 行命中），sitemap lastmod 与页面
 * JSON-LD dateModified 因此输出「2612 年」。构建器已加区间收敛；本脚本只修存量。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-dirty-watermark-repair.ts          # DRY
 *   npx tsx scripts/tools/notice-public-dirty-watermark-repair.ts --apply  # 重建脏行
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { rebuildPublicRowsByIds } from "../../src/lib/services/notice-public/rebuild";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const APPLY = process.argv.includes("--apply");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

const DIRTY = "updated_at IS NOT NULL AND (updated_at < 946684800 OR updated_at > 4102444800)";

const [before] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM notice_public WHERE ${DIRTY}`);
console.log(`脏 updated_at：${before[0]?.n ?? 0} 行`);
if (!APPLY) {
  console.log("DRY：加 --apply 才重建");
  await pool.end();
  process.exit(0);
}

const [rows] = await pool.query<RowDataPacket[]>(`SELECT notice_pk FROM notice_public WHERE ${DIRTY} ORDER BY notice_pk`);
const ids = rows.map((r) => Number(r.notice_pk));
console.log(`待重建 ${ids.length} 行…`);
const written = await rebuildPublicRowsByIds(pool, ids);

const [after] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM notice_public WHERE ${DIRTY}`);
const [sample] = await pool.query<RowDataPacket[]>(
  `SELECT notice_pk, updated_at FROM notice_public WHERE notice_pk IN (${ids.slice(0, 3).map(() => "?").join(",")})`,
  ids.slice(0, 3),
);
console.log(`完成：写入 ${written} · 剩余脏值 ${after[0]?.n ?? 0} · 抽样 ${JSON.stringify(sample)}`);
await pool.end();
