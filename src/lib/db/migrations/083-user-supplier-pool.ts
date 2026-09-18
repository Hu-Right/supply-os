/**
 * 083: 用户供应商资源库
 * user-supplier-pool
 *
 * 新增 crm_user_supplier_pool 表，供所有用户（企业+个人）管理合作工厂列表，
 * 用于 AI 智能匹配（从资源库推荐 Top N 供应商）。
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 83,
  name: "user-supplier-pool",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_user_supplier_pool (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
        supplier_id BIGINT UNSIGNED NULL COMMENT '关联 supplier 表',
        qualification_id BIGINT UNSIGNED NULL COMMENT '关联 crm_supplier_qualification 表',
        source VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT '来源: platform/manual',
        notes TEXT NULL COMMENT '私有备注',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_supplier (user_id, supplier_id),
        UNIQUE KEY uk_user_qualification (user_id, qualification_id),
        KEY idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migration-083] 用户供应商资源库表已就绪");
  },
};
