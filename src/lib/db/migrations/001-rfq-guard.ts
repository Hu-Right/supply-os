/**
 * 迁移 001 · 平台 RFQ 守护登记表
 *
 * @module server/db/migrations/001-rfq-guard
 * @description 建 crm_rfq_guard：登记每条平台 RFQ 的预期归属（主键落位 + reference + 创建者），
 *              供周期对账检出「主行被外部爬虫按主键 id 改写 / 消失」——即后台 syncRunner
 *              平台行护栏一旦被移除所致的静默跨系统契约回归。本表由 supply-os 独占写入，
 *              爬虫同步（仅 crm_bid_notices / crm_bid_opportunities）永不触碰，故可作「预期真相」。
 *              DDL 幂等（CREATE TABLE IF NOT EXISTS），表级字符集/排序/引擎显式统一（见 DC 红线）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 1,
  name: "rfq_guard",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `crm_rfq_guard` (" +
        "`rfq_id` INT NOT NULL COMMENT '平台RFQ在 crm_bid_notices.id 的落位（本表主键；爬虫同步不触碰本表）', " +
        "`reference` VARCHAR(100) NOT NULL COMMENT 'OSRFQ-{id} 唯一编号快照，供对账定位', " +
        "`user_id` INT NULL COMMENT '创建者 user_id 快照，对账时校验主行归属未被改写', " +
        "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间', " +
        "PRIMARY KEY (`rfq_id`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='平台RFQ守护登记表：记录每条RFQ预期归属，对账检出被爬虫按主键改写/消失（跨系统契约哨兵）'",
    );
  },
};
