/**
 * 一次性回填检索日志的归一化词 q_norm（历史行补数，让真实热门搜索有冷启动数据）
 *
 * 背景：迁移 044 新增 q_norm 后，历史行 q_norm 为 NULL，热门聚合只能统计迁移之后的检索。
 * 本脚本按「与线上写入完全同一套归一化口径」（search-analytics/hot-search-core.normalizeSearchTerm）
 * 把历史行的 q 补成 q_norm；PII/纯符号/超长词归一后为 null 的行保持 NULL（不参与热榜）。
 *
 * 用法：
 *   npx tsx scripts/tools/backfill-search-log-norm.ts            # DRY：只报可回填行数与样例
 *   npx tsx scripts/tools/backfill-search-log-norm.ts --apply    # 真正写库（幂等：只处理 q_norm 为空的行）
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { normalizeSearchTerm } from "../../src/lib/services/search-analytics/hot-search-core";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

type LogRow = { id: number; q: string | null };

try {
  const [[before]] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            SUM(q_norm IS NOT NULL AND q_norm <> '') AS normed,
            SUM((q_norm IS NULL OR q_norm = '') AND q IS NOT NULL AND q <> '') AS pending
       FROM user_search_log`,
  );
  console.log(
    `[backfill] 总行数 ${before.total} · 已归一 ${before.normed ?? 0} · 待回填 ${before.pending ?? 0}${APPLY ? "" : "（DRY，不写库）"}`,
  );

  let lastId = 0;
  let scanned = 0;
  let fillable = 0;
  let updated = 0;
  let dropped = 0;
  const samples: Array<{ id: number; q: string; qNorm: string }> = [];

  for (;;) {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id, q FROM user_search_log
        WHERE id > ? AND (q_norm IS NULL OR q_norm = '')
          AND q IS NOT NULL AND q <> ''
        ORDER BY id ASC LIMIT ?`,
      [lastId, BATCH],
    );
    const list = rows as LogRow[];
    if (list.length === 0) break;
    scanned += list.length;
    lastId = Number(list[list.length - 1].id);

    for (const row of list) {
      const qNorm = normalizeSearchTerm(row.q);
      if (!qNorm) { dropped += 1; continue; }
      fillable += 1;
      if (samples.length < 10) samples.push({ id: Number(row.id), q: String(row.q), qNorm });
      if (APPLY) {
        await pool.query("UPDATE user_search_log SET q_norm = ? WHERE id = ?", [qNorm, row.id]);
        updated += 1;
      }
    }
    if (list.length < BATCH) break;
  }

  console.log(`[backfill] 扫描 ${scanned} · 可归一 ${fillable} · PII/无效丢弃 ${dropped} · 已更新 ${updated}`);
  console.log("[backfill] 样例:", JSON.stringify(samples, null, 1));
} finally {
  await pool.end();
}
