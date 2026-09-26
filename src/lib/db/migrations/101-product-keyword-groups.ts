/**
 * 101: 产品关键词组表（product_keyword_lib 权益载体，spec §4.1）
 *
 * 新增一张表：
 * - crm_product_keyword_groups：用户私有"产品词组"（如"光伏逆变器"→[词...]），
 *   一期为搜索联动（组内词=包含模式多行）；二期主动推送/监控吃同一份数据。
 *   容量口径（服务层校验）：每组 1–20 词、每人软上限 50 组。
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

export const migration: Migration = {
  version: 101,
  name: "product-keyword-groups",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_product_keyword_groups (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(100) NOT NULL,
        terms JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_name (user_id, name),
        KEY idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[migration-101] 产品关键词组表已就绪");
  },
};
