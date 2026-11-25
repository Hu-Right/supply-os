/**
 * 一次性建表：user_mfa（账号级 TOTP 两步验证）
 *
 * 说明：按产品要求不走迁移体系，直接建表；本脚本幂等，可在任意环境执行。
 * 结构变更请手工同步 db/schema/baseline.sql。
 *
 * 用法：node scripts/tools/create-user-mfa-table.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const DDL = `
  CREATE TABLE IF NOT EXISTS user_mfa (
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户 ID（users.id）',
    secret VARCHAR(512) NULL COMMENT '启用后的 TOTP 密钥（AES-256-GCM 加密）',
    pending_secret VARCHAR(512) NULL COMMENT '绑定中的临时密钥（加密，未验证前不启用）',
    enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用两步验证',
    recovery_hashes TEXT NULL COMMENT '一次性恢复码 SHA-256 哈希 JSON 数组',
    last_time_step BIGINT NULL COMMENT '最近成功使用的时间步（防重放）',
    fail_count INT NOT NULL DEFAULT 0 COMMENT '连续失败次数（审计/限流）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户两步验证（TOTP，账号级）'
`;

const c = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: (process.env.DB_PASSWORD || "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME || "crm",
  charset: "utf8mb4",
});
await c.query(DDL);
console.log("✓ user_mfa 表已就绪");
await c.end();
