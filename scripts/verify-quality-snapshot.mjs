// C.3.5/F.5 质量快照只读实测：与 server.ts captureDataQualitySnapshot 同构的三条扫描 SQL，
// 只 SELECT 不写库，验证指标口径正确性与耗时。可随时复跑。
// 注：初版单条巨型 SQL（逐行相关 NOT EXISTS）实测 20 分钟不返回已废弃，此为拆分后版本。
import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const deadlineSecExpr =
  "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

// ① 主表单遍聚合
let t = Date.now();
const [baseRows] = await pool.query(
  `SELECT
     COUNT(*) AS total_notices,
     SUM(n.estimated_value IS NULL OR TRIM(n.estimated_value) = '') AS missing_value,
     SUM(n.country IS NULL OR TRIM(n.country) = '') AS missing_country,
     SUM(n.deadline_ts IS NULL) AS missing_deadline,
     SUM((n.is_expired = 0 OR n.is_expired IS NULL)
       AND n.deadline_ts IS NOT NULL
       AND ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW())) AS expired_but_active
   FROM crm_bid_notices n`
);
const tBase = Date.now() - t;

// ② 未桥接数（派生表 LEFT JOIN）
t = Date.now();
const [unlinkedRows] = await pool.query(
  `SELECT COUNT(*) AS unlinked_unspsc
   FROM crm_bid_notices n
   LEFT JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes) b ON b.notice_id = n.id
   WHERE b.notice_id IS NULL`
);
const tUnlinked = Date.now() - t;

// ③ F.5 重复检测
t = Date.now();
const [dupRows] = await pool.query(
  `SELECT COUNT(*) - COUNT(DISTINCT d.notice_id) AS dup_notice_cnt
   FROM crm_bid_notices d
   WHERE d.notice_id IS NOT NULL AND TRIM(d.notice_id) <> ''`
);
const tDup = Date.now() - t;

const m = {
  ...baseRows[0],
  unlinked_unspsc: unlinkedRows[0].unlinked_unspsc,
  dup_notice_cnt: dupRows[0].dup_notice_cnt,
};
console.log("== C.3.5 质量快照指标（只读实测）==");
for (const [k, v] of Object.entries(m)) console.log(`${String(k).padEnd(20)} ${v}`);
console.log(`\n耗时: 主表聚合 ${tBase}ms | 未桥接 ${tUnlinked}ms | 重复检测 ${tDup}ms | 合计 ${tBase + tUnlinked + tDup}ms`);

const total = Number(m.total_notices);
const pct = (v) => ((Number(v) / total) * 100).toFixed(1) + "%";
console.log("\n== 占比 ==");
console.log(`missing_value        ${pct(m.missing_value)}`);
console.log(`missing_country      ${pct(m.missing_country)}`);
console.log(`missing_deadline     ${pct(m.missing_deadline)}`);
console.log(`unlinked_unspsc      ${pct(m.unlinked_unspsc)}  <- 召回盲区`);
console.log(`expired_but_active   ${pct(m.expired_but_active)}  <- F.3 兜底拦截量`);
console.log(`dup_notice_cnt       ${pct(m.dup_notice_cnt)}  <- F.5：>0 需推荐按 notice_id 去重`);

await pool.end();
