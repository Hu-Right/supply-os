/**
 * 迁移 005 · RFQ 发布邀约触达账本
 *
 * @module server/db/migrations/005-rfq-outreach
 * @description 建 rfq_outreach：记录每条已发布 RFQ 已向哪些收件（邮箱/供应商）发过邀约，
 *              供发布触达去重（避免同一需求对同一收件反复邮件）。recipient 存邮箱为唯一键，
 *              既支持「匹配到的认证供应商」也支持「显式收件」。本表由 supply-os 独占写入。
 *              DDL 幂等，表级字符集/排序/引擎显式统一（DC 红线）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 5,
  name: "rfq_outreach",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `rfq_outreach` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "`rfq_id` INT NOT NULL COMMENT '平台RFQ在 bid_notices.id 的落位', " +
        "`recipient` VARCHAR(190) NOT NULL COMMENT '收件邮箱（匹配供应商或显式收件）', " +
        "`supplier_user_id` INT UNSIGNED NULL COMMENT '若收件对应平台供应商账号则记录其 user_id，显式外部邮箱为 NULL', " +
        "`contacted_at` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '首次触达时间（epoch 秒）', " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `uk_rfq_recipient` (`rfq_id`, `recipient`), " +
        "KEY `idx_rfq` (`rfq_id`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='RFQ发布邀约触达账本：记录已发邀约的收件，供发布触达去重'",
    );
  },
};
