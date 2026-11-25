/**
 * 译文流水线预估（只读，不调用翻译通道）
 *
 * 用法：npx tsx --env-file=.env scripts/tools/seo-translate-dry-run.mts
 *
 * 输出：可索引集合中「缺中文标题」的条数、待翻字符量、按通道单价估算的成本区间。
 * 用途：翻译预算是产品决策，先给出账再看是否开跑。
 */
import mysql from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE, PLATFORM_PUBLISHED_ONLY } from "../../src/lib/utils/notice-expired";
import { INDEXABLE_NOTICE_WHERE } from "../../src/lib/services/seo/indexable";

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
  const [rows] = await pool.query(
    `SELECT
        COUNT(*) AS missing,
        COALESCE(SUM(CHAR_LENGTH(COALESCE(NULLIF(p.title, ''), ''))), 0) AS title_chars,
        COALESCE(SUM(LEAST(CHAR_LENGTH(COALESCE(NULLIF(p.description, ''), '')), 300)), 0) AS body_chars
       FROM bid_notices n
       JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${ACTIVE_NOTICE_WHERE}
        AND ${PLATFORM_PUBLISHED_ONLY}
        AND ${INDEXABLE_NOTICE_WHERE}
        AND (p.title_cn IS NULL OR p.title_cn = '')`,
  );
  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  const missing = Number(row.missing ?? 0);
  const titleChars = Number(row.title_chars ?? 0);
  const bodyChars = Number(row.body_chars ?? 0);
  const totalChars = titleChars + bodyChars;

  // 单价区间按 2026 年常见机翻通道估算（元 / 百万字符），实际以合同为准
  const low = (totalChars / 1_000_000) * 20;
  const high = (totalChars / 1_000_000) * 80;

  console.log(`缺中文标题（可索引集合内）：${missing.toLocaleString("zh-CN")} 条`);
  console.log(`待翻字符：标题 ${titleChars.toLocaleString("zh-CN")} + 摘要 ${bodyChars.toLocaleString("zh-CN")} = ${totalChars.toLocaleString("zh-CN")}`);
  console.log(`按 20–80 元/百万字符估算：¥${low.toFixed(1)} – ¥${high.toFixed(1)}（不含重试与人工抽检）`);
  console.log(`分批建议：每轮 2000 条，约 ${Math.ceil(missing / 2000)} 轮；只写 title_cn/description_cn，不动正文`);
  process.exitCode = 0;
} catch (err) {
  console.error("[seo-translate-dry-run] 失败:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
