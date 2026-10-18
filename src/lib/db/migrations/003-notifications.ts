/**
 * 迁移 003 · 站内信/收件箱
 *
 * @module server/db/migrations/003-notifications
 * @description 建 crm_notifications：站内信收件箱（此前系统仅有邮件跟踪，无站内信设施）。
 *              RFQ 闭环触达用（新RFQ/收到报价/中标），亦可复用于其他站内提醒。
 *              ref_id 供业务侧幂等去重；派发失败不阻断主流程由服务层保证。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 3,
  name: "notifications",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `crm_notifications` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "`user_id` INT UNSIGNED NOT NULL COMMENT '收件人 user_id', " +
        "`type` VARCHAR(32) NOT NULL COMMENT '类型：rfq_new/rfq_quoted/rfq_won 等', " +
        "`title` VARCHAR(200) NOT NULL COMMENT '标题', " +
        "`body` VARCHAR(500) NULL COMMENT '正文摘要', " +
        "`link` VARCHAR(200) NULL COMMENT '跳转链接，如 /rfq/{id}', " +
        "`ref_id` BIGINT UNSIGNED NULL COMMENT '关联业务对象 id，幂等/去重用', " +
        "`is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0未读 1已读', " +
        "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (`id`), " +
        "KEY `idx_notif_user` (`user_id`,`is_read`,`id`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='站内信收件箱：RFQ闭环等站内提醒；ref_id 供幂等去重'",
    );
  },
};
