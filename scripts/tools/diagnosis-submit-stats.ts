/**
 * 诊断提交结果统计 CLI
 *
 * @description 读取 supplier_diagnosis_submit_log，按天聚合 success/rejected/error 与错误码，
 *              用于判断「诊断没人提交」到底是没流量，还是来了被 400/403 拦住。
 *
 * 用法：
 *   npx tsx scripts/tools/diagnosis-submit-stats.ts            # 最近 14 天
 *   npx tsx scripts/tools/diagnosis-submit-stats.ts --days=30
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = Math.max(1, Math.min(Number(daysArg ? daysArg.slice("--days=".length) : 14) || 14, 365));

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
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(created_at) AS d, result, COALESCE(error_code, '-') AS code,
            COALESCE(reason, '-') AS reason, COUNT(*) AS n
       FROM supplier_diagnosis_submit_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY d, result, code, reason
      ORDER BY d DESC, n DESC`,
    [DAYS],
  );

  console.log(`诊断提交结果（最近 ${DAYS} 天）`);
  if (rows.length === 0) {
    console.log("（暂无记录：要么没人提交，要么新埋点尚未产生数据）");
  } else {
    for (const r of rows) {
      console.log(`${r.d}  ${String(r.result).padEnd(8)} code=${String(r.code).padEnd(6)} reason=${r.reason}  ×${r.n}`);
    }
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.result, (totals.get(r.result) ?? 0) + Number(r.n));
    console.log("合计:", Object.fromEntries(totals));
  }

  // 引导卡曝光/点击/关闭：判断卡片有没有被看到、点击率
  const [guideRows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(created_at) AS d, event, COUNT(*) AS n
       FROM supplier_diagnosis_guide_event
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY d, event
      ORDER BY d DESC, n DESC`,
    [DAYS],
  );
  console.log(`\n诊断引导卡事件（最近 ${DAYS} 天）`);
  if (guideRows.length === 0) {
    console.log("（暂无记录）");
  } else {
    for (const r of guideRows) console.log(`${r.d}  ${String(r.event).padEnd(10)} ×${r.n}`);
    const totalsByEvent = new Map<string, number>();
    for (const r of guideRows) totalsByEvent.set(r.event, (totalsByEvent.get(r.event) ?? 0) + Number(r.n));
    console.log("合计:", Object.fromEntries(totalsByEvent));
  }
} finally {
  await pool.end();
}
