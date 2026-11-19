/**
 * 商机服务行行业校准 CLI：以 `bid_opportunities.industry` 为准回写 `notice_public.industry`。
 *
 * 为什么需要：商机行业由运营/商机侧维护（canonical 采购主题），比公告主表行业更可信；
 * 服务表构建器对可重建行已优先取商机行业，本工具兜底构建器不再准入的存量行，
 * 保证首页商机/行业筛选与商机表口径一致。
 *
 * 唯一写入者纪律（N1）：本脚本不拼任何 UPDATE，写入全部委托 build.ts 的
 * `syncPublicIndustryFromOpportunity`（服务表唯一写入模块）。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-sync-opportunity-industry.ts           # DRY：只统计
 *   npx tsx scripts/tools/notice-public-sync-opportunity-industry.ts --apply   # 真写
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { syncPublicIndustryFromOpportunity } from "../../src/lib/services/notice-public/build";

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
  const res = await syncPublicIndustryFromOpportunity(pool, { apply: APPLY });
  if (APPLY) {
    console.log(`✔ 商机行业校准完成：扫描 ${res.scanned} 行，更新 ${res.updated} 行`);
  } else {
    console.log(`DRY：扫描 ${res.scanned} 行，待更新 ${res.pending} 行（加 --apply 执行）`);
  }
} finally {
  await pool.end();
}
