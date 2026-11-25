/**
 * 可索引集合统计（SEO/GEO 周报口径）
 *
 * 用法：npx tsx --env-file=.env scripts/tools/seo-count-indexable.mts
 *
 * 输出：有效公告数、可索引数、各门槛的排除量、已译标题占比。
 * 只读查询，不写库。
 */
import mysql from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE, PLATFORM_PUBLISHED_ONLY } from "../../src/lib/utils/notice-expired";
import { INDEXABLE_NOTICE_WHERE } from "../../src/lib/services/seo/indexable";

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

async function scalar(sql: string): Promise<number> {
  const [rows] = await pool.query(sql);
  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  return Number(Object.values(row)[0] ?? 0);
}

try {
  const active = await scalar(
    `SELECT COUNT(*) FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY}`,
  );
  const indexable = await scalar(
    `SELECT COUNT(*) FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY} AND ${INDEXABLE_NOTICE_WHERE}`,
  );
  const translated = await scalar(
    `SELECT COUNT(*) FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY} AND ${INDEXABLE_NOTICE_WHERE}
        AND p.title_cn IS NOT NULL AND p.title_cn <> ''`,
  );
  const missingCountry = await scalar(
    `SELECT COUNT(*) FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY} AND p.country_code IS NULL`,
  );
  const emptyContent = await scalar(
    `SELECT COUNT(*) FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY}
        AND p.content_level = 'empty'`,
  );
  const shortBody = await scalar(
    `SELECT COUNT(*) FROM bid_notices n JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY}
        AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(
              COALESCE(NULLIF(p.description_cn,''), NULLIF(p.description,'')),
              '\\r',''), '\\n',''))) < 200`,
  );

  const pct = (n: number) => (indexable > 0 ? ((n / indexable) * 100).toFixed(1) : "0.0");
  console.log(`有效公告（含平台已发布 RFQ）：${active}`);
  console.log(`可索引集合：${indexable}（占有效 ${active > 0 ? ((indexable / active) * 100).toFixed(1) : "0.0"}%）`);
  console.log(`  其中已译标题：${translated}（${pct(translated)}%）`);
  console.log(`排除量（参考）：缺国别 ${missingCountry} / 空白正文 ${emptyContent} / 正文<200字 ${shortBody}`);
  console.log(`预计 sitemap 分片：${Math.ceil(indexable / 50000)} 片（每片 5 万）`);
  process.exitCode = 0;
} catch (err) {
  console.error("[seo-count-indexable] 失败:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
