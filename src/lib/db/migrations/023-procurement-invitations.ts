/**
 * 迁移 023 · 发布后邀约表（分发闭环）
 *
 * @module server/db/migrations/023-procurement-invitations
 * @description 2026-11-15：`procurement_matches` 只是"候选名单"（谁可能合适），
 *              没有任何地方记录"到底有没有告诉过他、他看没看、他应不应"。
 *              生产实测：`matches.status='invited'` 从未被写过，供应商侧也没有入口，
 *              于是"发布即匹配"停在算完分给自己看。
 *
 *              本表把"一次触达"变成可追溯的一行：
 *                一条需求 × 一家供应商 × 一个版本 = 一行（uq 防重发）；
 *                `status` 承载回执（sent/viewed/responded/declined/failed/unsubscribed）；
 *                `channel` 区分站内信与邮件（有账号的 22 家走站内信，其余 8.8 万邮箱走邮件）。
 *
 *              为什么不复用 matches：候选是"可能"，邀约是"已发生"，两者生命周期不同
 *              （候选可被重算覆盖，邀约一旦发出不可抹掉）。
 *              退订与频控不另建表：status='unsubscribed' + idx_inv_supplier(supplier_id, sent_at) 足够。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 23,
  name: "procurement_invitations",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `procurement_invitations` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键', " +
        "`project_id` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id', " +
        "`supplier_id` INT UNSIGNED NOT NULL COMMENT '供应商 supplier.id', " +
        "`version_no` INT NOT NULL COMMENT '邀约针对的需求版本号（改稿重发时区分）', " +
        "`score` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '生成时的匹配分快照（0-100，按可得信号归一）', " +
        "`reasons` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '命中维度说明，如 品类L3;省份;资料分88;已注册', " +
        "`channel` VARCHAR(16) NOT NULL COMMENT '触达通道：inapp 站内信 / email 邮件', " +
        "`recipient_email` VARCHAR(150) DEFAULT NULL COMMENT '邮件通道收件地址（发送时快照）', " +
        "`recipient_user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '站内信收件人 crm_users.id（supplier_claims approved）', " +
        "`token` CHAR(32) NOT NULL COMMENT '落地页与退订识别令牌（32 位 hex）', " +
        "`status` VARCHAR(16) NOT NULL DEFAULT 'sent' COMMENT '回执状态：sent/viewed/responded/declined/failed/unsubscribed', " +
        "`decline_reason` VARCHAR(255) DEFAULT NULL COMMENT '供应商明确不参与的原因（status=declined）', " +
        "`fail_reason` VARCHAR(255) DEFAULT NULL COMMENT '发送失败原因（status=failed，供重试诊断）', " +
        "`sent_at` INT UNSIGNED NOT NULL COMMENT '发送时间（秒）', " +
        "`viewed_at` INT UNSIGNED DEFAULT NULL COMMENT '供应商打开落地页时间（秒），仅记首次', " +
        "`responded_at` INT UNSIGNED DEFAULT NULL COMMENT '应标/不参与时间（秒）', " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `uq_inv_project_supplier_ver` (`project_id`,`supplier_id`,`version_no`), " +
        "UNIQUE KEY `uq_inv_token` (`token`), " +
        "KEY `idx_inv_supplier` (`supplier_id`,`sent_at`), " +
        "KEY `idx_inv_project_status` (`project_id`,`status`) " +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='发布后邀约与回执：一条需求×一家供应商×一个版本一行，分发闭环的唯一事实源'",
    );
  },
};
