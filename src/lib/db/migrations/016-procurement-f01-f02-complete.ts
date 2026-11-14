/**
 * 迁移 016 · F01/F02 全量字段补齐
 *
 * @module server/db/migrations/016-procurement-f01-f02-complete
 * @description 按全案 F01（14 项）与 F02（10 大类 35 问）的剩余缺口增列：
 *              ① procurement_buyers.procurement_experience —— F01 第 9 项「采购经验」；
 *              ② procurement_projects 五项 —— F02 第 2 类「用途及使用环境」、
 *                 第 3 类「强制性标准/认证」、第 4 类「分批采购/交付」、
 *                 第 6 类「运输/包装/清关」已有 logistics_note、第 7 类「Incoterms 版本」。
 *              DDL 幂等（ensureColumn 先查 information_schema）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 16,
  name: "procurement_f01_f02_complete",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "procurement_experience",
      "procurement_experience varchar(500) DEFAULT NULL COMMENT '采购经验：是否在其他平台发布过招标/采购订单（F01 第9项）'",
    );

    await ensureColumn(
      dbPool,
      "procurement_projects",
      "usage_env",
      "usage_env text DEFAULT NULL COMMENT '产品主要用途及使用环境（F02 需求对象）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "standards",
      "standards text DEFAULT NULL COMMENT '强制性标准/认证要求（F02 技术要求）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "incoterm_version",
      "incoterm_version varchar(20) DEFAULT NULL COMMENT 'Incoterms 版本（如 2020/2010）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "batch_delivery",
      "batch_delivery tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否分批采购/分批交付（F02 数量要求）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "batch_note",
      "batch_note varchar(500) DEFAULT NULL COMMENT '分批说明（批次/频次/每批数量）'",
    );
  },
};
