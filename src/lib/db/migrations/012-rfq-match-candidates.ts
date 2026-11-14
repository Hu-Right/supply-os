/**
 * 迁移 012 · 发布即匹配候选名单（规则版）
 *
 * @module server/db/migrations/012-rfq-match-candidates
 * @description 七步流程第 7 步：「正式发布采购需求，开始供应商智能匹配」的 MVP 底表——
 *              发布成功后按需求的行业 L1 段 + 省份优先筛供应商（仅平台核验 done），
 *              scoring 模型属 P3，本表先承接规则版候选与去重（uq demand+supplier）。
 *              DDL 幂等，表级字符集/排序/引擎显式统一（同 002/010 口径）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 12,
  name: "rfq_match_candidates",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `rfq_match_candidates` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "`demand_id` INT UNSIGNED NOT NULL COMMENT '关联 rfq_demand.id', " +
        "`supplier_id` INT UNSIGNED NOT NULL COMMENT '供应商 supplier.id', " +
        "`score` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '规则匹配得分（MVP：行业 L1 匹配基础分+省份加分；评分模型 P3）', " +
        "`reasons` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '命中维度说明（行业/省份）', " +
        "`created_at` INT UNSIGNED NOT NULL COMMENT '生成时间（秒）', " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `uq_match_demand_supplier` (`demand_id`,`supplier_id`), " +
        "KEY `idx_match_demand` (`demand_id`,`score`) " +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='发布即匹配候选名单（规则版）：发布成功后按行业 L1+省份生成，评审/邀约的消费底表'",
    );
  },
};
