/**
 * 迁移 002 · RFQ 报价表
 *
 * @module server/db/migrations/002-rfq-quotes
 * @description 建 crm_rfq_quotes：认证供应商对已发布 RFQ 的密封报价。一 (rfq_id, supplier_user_id)
 *              一条有效报价（UNIQUE，可改不可多投）。选定/中标以 status(won/rejected) 表达，
 *              不改 rfq_status、不碰 PLATFORM_PUBLISHED_ONLY 可搜口径（见 spec §1）。
 *              supply-os 独占写入，爬虫同步不触碰本表。DDL 幂等，表级字符集/排序/引擎显式统一。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 2,
  name: "rfq_quotes",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `crm_rfq_quotes` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "`rfq_id` INT NOT NULL COMMENT '所报 RFQ 的 crm_bid_notices.id 落位', " +
        "`supplier_user_id` INT UNSIGNED NOT NULL COMMENT '报价供应商 user_id（认证企业）', " +
        "`price` DECIMAL(20,2) NOT NULL COMMENT '报价金额', " +
        "`currency` VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种', " +
        "`lead_time_days` INT NULL COMMENT '交付周期（天）', " +
        "`delivery_terms` VARCHAR(200) NULL COMMENT '交付/商务条款', " +
        "`note` VARCHAR(1000) NULL COMMENT '报价说明', " +
        "`status` VARCHAR(16) NOT NULL DEFAULT 'submitted' COMMENT 'submitted/withdrawn/won/rejected', " +
        "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `uq_rfq_supplier` (`rfq_id`,`supplier_user_id`), " +
        "KEY `idx_quotes_rfq` (`rfq_id`,`status`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='RFQ密封报价表：认证供应商报价，选定以status表达，不动rfq_status/可搜口径'",
    );
  },
};
