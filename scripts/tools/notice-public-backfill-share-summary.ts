/**
 * 回填服务表分享卡摘要（share_summary / share_summary_en）
 *
 * 加列后存量 53 万行不会自动有值：构建器只覆盖被重新构建选中的行。
 * 本脚本复用 build.ts 的唯一写入者函数 backfillShareSummaries 分批补齐，
 * 抽不出可用文本的行保持 NULL（读侧回退标题）。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-backfill-share-summary.ts --dry --limit=1000
 *   npx tsx scripts/tools/notice-public-backfill-share-summary.ts --apply
 *   npx tsx scripts/tools/notice-public-backfill-share-summary.ts --apply --limit=50000
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { backfillShareSummaries } from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

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
  const startedAt = Date.now();
  const result = await backfillShareSummaries(pool, { apply: APPLY, limit: LIMIT });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[share-summary] ${APPLY ? "已回填" : "DRY"}：扫描 ${result.scanned} 行，` +
    `${APPLY ? "写入" : "待写入"} ${result.updated} 行，耗时 ${elapsed}s`,
  );
  if (!APPLY) console.log("[share-summary] 加 --apply 才会写库");
} finally {
  await pool.end();
}
