// 只读探查脚本：查看 estimated_value 字段的真实存储格式（纯 SELECT，不修改任何数据）
// 用途：为计划文档 D.3 金额解析规则提供数据事实依据。用后可删。
import mysql2 from "mysql2/promise";

const pool = mysql2.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const TABLES = ["crm_bid_notices", "crm_bid_opportunities"];

function classify(v) {
  const s = String(v).trim();
  if (!s) return "空字符串";
  if (/^\d+(\.\d+)?$/.test(s)) return "纯数字";
  if (/^[\d,]+(\.\d+)?$/.test(s)) return "数字带千分位";
  if (/-|–|to|~/i.test(s) && /\d/.test(s)) return "区间";
  if (/(USD|EUR|CNY|RMB|GBP|JPY|\$|€|¥|£)/i.test(s)) return "含币种标识";
  if (/\d/.test(s)) return "其他含数字";
  return "无数字文本";
}

for (const table of TABLES) {
  console.log(`\n===== ${table} =====`);
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE 'estimated_value'`);
    console.log("字段定义:", JSON.stringify(cols));

    const [[cov]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN estimated_value IS NULL OR estimated_value = '' THEN 1 ELSE 0 END) AS empty_cnt
       FROM ${table}`
    );
    console.log(`总行数=${cov.total}  空值=${cov.empty_cnt}  非空=${cov.total - cov.empty_cnt}`);

    const [rows] = await pool.query(
      `SELECT estimated_value AS v, COUNT(*) AS c
       FROM ${table}
       WHERE estimated_value IS NOT NULL AND estimated_value <> ''
       GROUP BY estimated_value ORDER BY c DESC LIMIT 30`
    );
    console.log("高频值 TOP30:");
    for (const r of rows) console.log(`  [${classify(r.v)}] x${r.c}  ${JSON.stringify(String(r.v).slice(0, 80))}`);

    const [samples] = await pool.query(
      `SELECT estimated_value AS v FROM ${table}
       WHERE estimated_value IS NOT NULL AND estimated_value <> ''
       ORDER BY RAND() LIMIT 200`
    );
    const buckets = {};
    for (const r of samples) {
      const k = classify(r.v);
      buckets[k] = (buckets[k] || 0) + 1;
    }
    console.log("随机 200 条样本格式分布:", JSON.stringify(buckets));
  } catch (err) {
    console.log("查询失败:", err.message);
  }
}

await pool.end();
