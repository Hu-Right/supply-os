/**
 * 品类归属候选登记 CLI —— daily-sync.cjs「同步后登记」那一棒（2026-11-13 接回）。
 *
 * 为什么存在：taxonomy_intake 候选登记的唯一触发点原挂在应用内 crawler-sync 每轮
 * 同步后；crawler-sync 已整体摘除（同步唯一入口回归 daily-sync.cjs），登记随之断供。
 * 本文件只做「连接池装配 + 自扫描候选」，登记写入全部委托 src 侧唯一生产者
 * taxonomy-intake（uk_src 幂等 + cap 限流），不复制任何候选谓词。
 *
 * 自扫描口径：活跃公告（utils/notice-expired 唯一口径）+ 无有效落点
 * （attribution-contract 唯一判据）+ 尚未登记过——三条件与 enqueueUnattributedNotices
 * 内部过滤一致，此处预筛只为省 cap；历史漏登的行也会被自然补上。
 *
 * 用法：
 *   npx tsx scripts/tools/taxonomy-intake-run.ts               # 登记一批（默认上限 2000）
 *   npx tsx scripts/tools/taxonomy-intake-run.ts --limit 5000  # 自定义单轮扫描上限
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { enqueueUnattributedNotices } from "../../src/lib/services/commodity/taxonomy-intake";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { withoutValidLandingWhere } from "../../src/lib/services/commodity/attribution-contract";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const limitIdx = process.argv.indexOf("--limit");
const SCAN_LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) || 2000 : 2000;

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
  const [rows] = await pool.query(
    `SELECT n.id FROM bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
       AND ${withoutValidLandingWhere()}
       AND NOT EXISTS (SELECT 1 FROM taxonomy_intake i WHERE i.source_table = 'bid_notices' AND i.source_pk = n.id)
     ORDER BY n.id
     LIMIT ${SCAN_LIMIT}`,
  );
  const ids = (rows as Array<{ id: number }>).map((r) => Number(r.id)).filter(Number.isInteger);
  // 1000/批分块调唯一生产者（占位符惯例对齐 syncNoticeIds），结果聚合
  let enqueued = 0, skipped = 0, deferred = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await enqueueUnattributedNotices(pool, ids.slice(i, i + 1000));
    enqueued += r.enqueued; skipped += r.skipped; deferred += r.deferred;
  }
  console.log(
    `[taxonomy-intake] 扫描 ${ids.length} · 登记 ${enqueued} · 跳过 ${skipped} · 顺延 ${deferred}` +
      (deferred > 0 ? `（候选超单轮上限，下轮继续）` : ""),
  );
} finally {
  await pool.end();
}
