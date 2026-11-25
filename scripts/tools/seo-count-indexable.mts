/**
 * 可索引集合统计（SEO/GEO 周报口径）
 *
 * 用法：npx tsx --env-file=.env scripts/tools/seo-count-indexable.mts
 *
 * 为什么在 Node 里逐页统计，而不是一条 COUNT：
 *   判定含 `CHAR_LENGTH(longtext)`；对 112 万行一次算完会被数据库服务端掐断连接
 *   （实测 PROTOCOL_CONNECTION_LOST）。这里按 id 每页 2,000 行取长度，进程内累加；
 *   本地经 SSH 隧道时每 20 页换一条新连接，避免连接时限。
 */
import mysql from "mysql2/promise";

const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 1,
  connectTimeout: 10_000,
};

const PAGE = 5_000;
const PAGES_PER_CONNECTION = 20;
const nowSec = Math.floor(Date.now() / 1000);

interface Row {
  id: number;
  deadline_sec: number | string | null;
  entry_source: string | null;
  rfq_status: string | null;
  country_code: string | null;
  notice_type_code: string | null;
  content_level: string | null;
  tl: number | string;
  dl: number | string;
  has_cn: number | string;
}

let cursor = 0;
let scanned = 0;
let indexable = 0;
let translated = 0;
let done = false;
const startedAt = Date.now();

while (!done) {
  const pool = mysql.createPool(cfg);
  try {
    for (let page = 0; page < PAGES_PER_CONNECTION; page += 1) {
      const [rows] = await pool.query(
        `SELECT n.id, n.deadline_sec, n.entry_source, n.rfq_status,
                p.country_code, p.notice_type_code, p.content_level,
                LEFT(COALESCE(NULLIF(p.title_cn,''), NULLIF(p.title,'')), 200) AS t,
                LEFT(COALESCE(NULLIF(p.description_cn,''), NULLIF(p.description,'')), 400) AS d,
                (p.title_cn IS NOT NULL AND p.title_cn <> '') AS has_cn
           FROM bid_notices n
           STRAIGHT_JOIN notice_public p ON p.notice_pk = n.id
          WHERE n.id > ?
          ORDER BY n.id
          LIMIT ?`,
        [cursor, PAGE],
      );
      const list = rows as Row[];
      if (list.length === 0) {
        done = true;
        break;
      }
      cursor = Number(list[list.length - 1].id);
      scanned += list.length;

      for (const r of list) {
        const active =
          r.deadline_sec === null || Number(r.deadline_sec) === 0 || Number(r.deadline_sec) >= nowSec;
        if (!active) continue;
        if (r.entry_source === "platform" && r.rfq_status !== "published") continue;
        if (!r.country_code || !r.notice_type_code) continue;
        if (r.content_level === "empty") continue;
        if ((r.t ?? "").length < 8 || (r.d ?? "").length < 200) continue;
        indexable += 1;
        if (Number(r.has_cn) === 1) translated += 1;
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }
  if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("统计超时（>10 分钟）");
}

const pct = indexable > 0 ? ((translated / indexable) * 100).toFixed(1) : "0.0";
console.log(`扫描公告：${scanned}，耗时 ${Date.now() - startedAt}ms`);
console.log(`可索引集合：${indexable}`);
console.log(`  其中已译标题：${translated}（${pct}%）`);
console.log(`预计 sitemap 分片：${Math.ceil(indexable / 50000)} 片（每片 5 万）`);
