/**
 * 生成 sitemap 快照（手动/部署预热）
 *
 * 用法：
 *   npx tsx --env-file=.env scripts/tools/seo-build-sitemap.mts
 *   npx tsx --env-file=.env scripts/tools/seo-build-sitemap.mts --force
 *
 * 说明：生产由应用内调度器每小时重建，本脚本用于首次部署、排障与本地验证。
 */
import mysql from "mysql2/promise";
import { buildSitemapSnapshots, sitemapDir } from "../../src/lib/services/seo/sitemap-snapshot";

const force = process.argv.includes("--force");
// 脚本自带连接池：src/lib/db/pool 带 server-only，不能在纯 Node 脚本里 import
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2,
  connectTimeout: 10_000,
});

try {
  console.log(`[seo-build-sitemap] 输出目录：${sitemapDir()}`);
  const result = await buildSitemapSnapshots(pool, { force });
  if (result.skipped) {
    console.log(`[seo-build-sitemap] 已是最新（${result.manifest.total} 条），未重写`);
  } else {
    console.log(
      `[seo-build-sitemap] 完成：${result.manifest.noticeShards} 片 / ${result.manifest.total} 条`,
    );
  }
  process.exitCode = 0;
} catch (err) {
  console.error("[seo-build-sitemap] 失败:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
