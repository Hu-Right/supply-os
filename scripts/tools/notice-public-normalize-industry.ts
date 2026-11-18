/**
 * 服务表 industry 列数据治理：旧 UGT-I 行业树码 / 中文别名 → canonical slug（或 NULL）。
 *
 * 2026-11-18：剔除「采购主题 slug → GB/T 行业门类」桥接后的历史数据清理。
 * 写入统一走 build.ts 的 normalizePublicIndustryColumn（N1 服务表单一写入者）。
 *
 * 用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/notice-public-normalize-industry.ts          # DRY
 *   npx tsx scripts/tools/notice-public-normalize-industry.ts --apply
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { normalizePublicIndustryColumn } from "../../src/lib/services/notice-public/build";

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
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

try {
  const t0 = Date.now();
  const result = await normalizePublicIndustryColumn(pool, { apply: APPLY });
  console.log(
    `[normalize-industry] ${APPLY ? "已写入" : "DRY"}：扫描 ${result.scanned} 行，` +
      `${APPLY ? "更新" : "待更新"} ${result.updated} 行，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  if (!APPLY) console.log("[normalize-industry] 加 --apply 才写入服务表");
} finally {
  await pool.end();
}
