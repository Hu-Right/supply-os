/**
 * 宽表一致性探针（只读，可反复执行）
 *
 * 用法：npx tsx scripts/verify-wide-ssot.ts
 *
 * 输出四项核对结果，全部为 0 表示「平台公告与爬虫数据适配」的可见性/编号目标达成：
 *   1) 平台公告不可见但宽表残留（D1/D2 反向）
 *   2) 平台公告 published 但宽表缺行（D2）
 *   3) precise_levelN 含非数字字符（D5 原码污染）
 *   4) 平台公告编号缺失或仍为 RFQ- 前缀（D12 / 迁移 086 回归）
 *
 * 退出码：全 0 → 0；任一失败或查询异常 → 1（可直接接进部署后校验）
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { DbConfigSchema } from "../src/lib/db/db-config.js";

// 与 src/lib/db/pool.ts 同一组环境变量；脚本侧独立建池，避免依赖 Next 运行时
const DB_CFG = DbConfigSchema.parse({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "crm",
});

const CHECKS: Array<{ name: string; sql: string }> = [
  {
    name: "不可见平台公告仍残留宽表（应为 0）",
    sql: `SELECT COUNT(*) AS n FROM crm_notice_search ns
          JOIN crm_bid_notices n ON n.id = ns.id
          WHERE n.entry_source = 'platform' AND IFNULL(n.rfq_status, '') <> 'published'`,
  },
  {
    name: "已发布平台公告宽表缺行（应为 0）",
    sql: `SELECT COUNT(*) AS n FROM crm_bid_notices n
          LEFT JOIN crm_notice_search ns ON ns.id = n.id
          WHERE n.entry_source = 'platform' AND IFNULL(n.rfq_status, '') = 'published'
            AND ns.id IS NULL`,
  },
  {
    name: "precise_levelN 含原码脏数据（应为 0）",
    sql: `SELECT COUNT(*) AS n FROM crm_notice_search
          WHERE precise_level1 REGEXP '[^0-9,]' OR precise_level2 REGEXP '[^0-9,]'
             OR precise_level3 REGEXP '[^0-9,]' OR precise_level4 REGEXP '[^0-9,]'
             OR precise_level5 REGEXP '[^0-9,]'`,
  },
  {
    name: "平台公告编号缺失或前缀非 OSRFQ-（应为 0）",
    sql: `SELECT COUNT(*) AS n FROM crm_bid_notices
          WHERE entry_source = 'platform'
            AND (notice_id IS NULL OR notice_id = '' OR reference IS NULL OR reference = ''
                 OR notice_id LIKE 'RFQ-%' OR reference LIKE 'RFQ-%')`,
  },
];

async function main() {
  console.log(`[verify-wide-ssot] 连接 ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database} ...`);
  const pool = mysql2.createPool({ ...DB_CFG, waitForConnections: true, connectionLimit: 2 });
  let bad = 0;
  for (const c of CHECKS) {
    try {
      const [rows] = await pool.query(c.sql);
      const n = Number((rows as RowDataPacket[])[0]?.n ?? -1);
      if (n !== 0) bad += 1;
      console.log(`${n === 0 ? "OK  " : "FAIL"} ${c.name}: ${n}`);
    } catch (err) {
      bad += 1;
      console.log(`ERROR ${c.name}: ${(err as Error).message}`);
    }
  }
  await pool.end().catch(() => {});
  process.exit(bad === 0 ? 0 : 1);
}

void main();
