/**
 * 迁移 004 · RFQ 定向邀约名单
 *
 * @module server/db/migrations/004-rfq-invites
 * @description 建 crm_rfq_invites：visibility='targeted' 的 RFQ 报价资格白名单。
 *              仅被采购方点名的供应商可报价；public RFQ 不使用本表。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 4,
  name: "rfq_invites",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `crm_rfq_invites` (" +
        "`rfq_id` INT NOT NULL COMMENT '目标 RFQ 的 crm_bid_notices.id 落位', " +
        "`supplier_user_id` INT UNSIGNED NOT NULL COMMENT '被邀约供应商 user_id', " +
        "`invited_by` INT UNSIGNED NOT NULL COMMENT '发起邀约的采购方 user_id', " +
        "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (`rfq_id`,`supplier_user_id`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='RFQ定向邀约名单：targeted RFQ 的报价资格白名单，public 不使用'",
    );
  },
};
