// T-E2 rollup 验证脚本（#12）：建表（与 server.ts DDL 同构）→ 全量聚合两遍验证幂等
// （重跑同日不翻倍）→ 直查 GROUP BY vs 读 rollup 耗时对比。只写自有 rollup 表。
import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  ok ? pass++ : fail++;
};

await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_view_daily (
      notice_id BIGINT UNSIGNED NOT NULL,
      stat_day DATE NOT NULL,
      view_cnt INT NOT NULL DEFAULT 0,
      uniq_user_cnt INT NOT NULL DEFAULT 0,
      PRIMARY KEY (notice_id, stat_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
console.log("建表 OK（IF NOT EXISTS 幂等）");

// rollup 聚合（server.ts rollupNoticeViewDaily 同构，改动需同步两处）
const rollup = () => pool.query(
  `INSERT INTO crm_notice_view_daily (notice_id, stat_day, view_cnt, uniq_user_cnt)
   SELECT notice_id, DATE(viewed_at), COUNT(*), COUNT(DISTINCT user_key)
   FROM crm_user_notice_views
   WHERE notice_id IS NOT NULL
   GROUP BY notice_id, DATE(viewed_at)
   ON DUPLICATE KEY UPDATE view_cnt = VALUES(view_cnt), uniq_user_cnt = VALUES(uniq_user_cnt)`
);

const t0 = Date.now();
await rollup();
console.log(`第一遍 rollup 耗时=${Date.now() - t0}ms`);
const [[s1]] = await pool.query(`SELECT COUNT(*) AS rows_total, COALESCE(SUM(view_cnt),0) AS sum_views FROM crm_notice_view_daily`);
await rollup();
const [[s2]] = await pool.query(`SELECT COUNT(*) AS rows_total, COALESCE(SUM(view_cnt),0) AS sum_views FROM crm_notice_view_daily`);
check("幂等：重跑后行数不变", Number(s1.rows_total) === Number(s2.rows_total), `${s1.rows_total} vs ${s2.rows_total}`);
check("幂等：重跑后 SUM(view_cnt) 不翻倍", Number(s1.sum_views) === Number(s2.sum_views), `${s1.sum_views} vs ${s2.sum_views}`);

// 与原始表口径核对（全量窗口下 rollup 总浏览数 = 原始表 notice_id 非空行数）
const [[raw]] = await pool.query(`SELECT COUNT(*) AS n FROM crm_user_notice_views WHERE notice_id IS NOT NULL`);
check("口径：SUM(view_cnt) = 原始表行数", Number(s2.sum_views) === Number(raw.n), `${s2.sum_views} vs ${raw.n}`);

// 耗时对比：直查 GROUP BY vs 读 rollup（30 天窗，各跑 5 次取均值）
const timeIt = async (label, sql) => {
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await pool.query(sql);
    times.push(Date.now() - t);
  }
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
  console.log(`${label}: avg=${avg}ms  (${times.join(",")})`);
  return Number(avg);
};
const tDirect = await timeIt(
  "直查原始表 GROUP BY",
  `SELECT notice_id, COUNT(DISTINCT user_key) AS score
   FROM crm_user_notice_views
   WHERE notice_id IS NOT NULL AND viewed_at >= NOW() - INTERVAL 30 DAY
   GROUP BY notice_id`
);
const tRollup = await timeIt(
  "读 rollup SUM",
  `SELECT notice_id, SUM(uniq_user_cnt) AS score
   FROM crm_notice_view_daily
   WHERE stat_day >= CURDATE() - INTERVAL 30 DAY
   GROUP BY notice_id`
);
check("rollup 读取不慢于直查（当前小表下允许持平）", tRollup <= tDirect + 5, `rollup=${tRollup}ms direct=${tDirect}ms`);

await pool.end();
console.log(`\nT-E2 rollup 验证：${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
