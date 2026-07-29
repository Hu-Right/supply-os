// T-B2 建表验证脚本（#11）：在生产库执行 crm_user_reco_feedback / crm_reco_weight_profile 的
// CREATE TABLE IF NOT EXISTS（与 server.ts ensureProcurementSchema 中 DDL 同构，改动需同步两处），
// 连续执行两遍验证幂等；随后 SHOW COLUMNS / SHOW INDEX 核对列清单、ENUM 隐式信号值与 uk_dedup 唯一约束。
// 仅写自有表，不触碰 CRM 外部表。
import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const DDL_FEEDBACK = `
    CREATE TABLE IF NOT EXISTS crm_user_reco_feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      notice_id BIGINT UNSIGNED NOT NULL,
      action ENUM('impression','click','unlock','dismiss','favorite','dwell','scroll_end','quick_exit','revisit') NOT NULL,
      reco_score DECIMAL(8,4) NULL,
      position INT NULL,
      variant VARCHAR(20) NULL,
      session_id VARCHAR(64) NULL,
      dwell_ms INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_dedup (user_key, notice_id, session_id, action),
      KEY idx_user_time (user_key, created_at),
      KEY idx_notice_action (notice_id, action),
      KEY idx_variant (variant, action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const DDL_PROFILE = `
    CREATE TABLE IF NOT EXISTS crm_reco_weight_profile (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL,
      w_unspsc DECIMAL(5,3) NOT NULL DEFAULT 0.500,
      w_agency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      w_amount DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_geo DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_urgency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user (user_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

// ① 幂等验证：同一 DDL 连续执行两遍不报错
for (const round of [1, 2]) {
  await pool.query(DDL_FEEDBACK);
  await pool.query(DDL_PROFILE);
  console.log(`[round ${round}] CREATE TABLE IF NOT EXISTS x2 执行成功（幂等 OK）`);
}

// ② 列清单核对
for (const table of ["crm_user_reco_feedback", "crm_reco_weight_profile"]) {
  const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
  console.log(`\n[${table}] 共 ${cols.length} 列:`);
  for (const c of cols) console.log(`  ${c.Field}  ${c.Type}  ${c.Null}  ${c.Key}  default=${c.Default}`);
}

// ③ ENUM 隐式信号值核对（D.5）
const [[actionCol]] = await pool.query(
  `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_user_reco_feedback' AND COLUMN_NAME = 'action'`
);
const required = ["impression", "click", "unlock", "dismiss", "favorite", "dwell", "scroll_end", "quick_exit", "revisit"];
const missing = required.filter((v) => !actionCol.t.includes(`'${v}'`));
console.log(`\n[action ENUM] ${actionCol.t}`);
console.log(missing.length === 0 ? "  隐式信号值齐全（D.5 OK）" : `  缺少: ${missing.join(",")} !!`);

// ④ uk_dedup 唯一约束核对（D.7）
const [idx] = await pool.query(
  `SHOW INDEX FROM crm_user_reco_feedback WHERE Key_name = 'uk_dedup'`
);
console.log(`\n[uk_dedup] non_unique=${idx[0]?.Non_unique}，列序=${idx.map((r) => r.Column_name).join(",")}`);
console.log(idx.length === 4 && idx[0].Non_unique === 0 ? "  唯一约束四列齐全（D.7 OK）" : "  约束异常 !!");

// ⑤ 行数（新表应为 0）
for (const table of ["crm_user_reco_feedback", "crm_reco_weight_profile"]) {
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
  console.log(`[${table}] rows=${n}`);
}

await pool.end();
console.log("\nT-B2 建表验证完成");
