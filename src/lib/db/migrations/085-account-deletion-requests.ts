/**
 * 迁移 085 · 账号注销申请
 *
 * @module lib/db/migrations/084-account-deletion-requests
 * @description 账号注销按「自助提交 → 客服核验 → 人工执行」落地（B2B 惯例）：
 *              用户在企业主体、发票、采购需求未结清时不能一键删号，必须有人核对。
 *              本表只记录申请与处理结果；真正的停用/匿名化由 ops 脚本执行（见 scripts/ops/execute-account-deletion.mts）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 85,
  name: "account_deletion_requests",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS account_deletion_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL COMMENT '申请注销的用户',
        identifier VARCHAR(200) NOT NULL DEFAULT '' COMMENT '申请时账号标识（手机/邮箱快照，便于人工核验）',
        reason VARCHAR(500) NULL COMMENT '用户填写的注销原因',
        contact VARCHAR(200) NULL COMMENT '用户留的回联方式',
        status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending / processing / done / rejected',
        handled_by VARCHAR(100) NULL COMMENT '处理人',
        handled_note VARCHAR(500) NULL COMMENT '处理说明（拒绝原因 / 执行结果）',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_status_created (status, created_at),
        KEY idx_user (user_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT '账号注销申请（自助提交 + 人工核验执行）'
    `);
  },
};
