/**
 * 迁移 031 · 供应商类型要求（三选一）
 *
 * @module server/db/migrations/031-supplier-type
 * @description 原 manufacturer_only 布尔只能表达“直投/不限”。改为：
 *              any / manufacturer_or_agent / manufacturer_only；
 *              旧 manufacturer_only=1 回填为 manufacturer_only。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 31,
  name: "supplier_type",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "supplier_type",
      "supplier_type varchar(24) NOT NULL DEFAULT 'any' COMMENT '供应商类型：any / manufacturer_or_agent / manufacturer_only'",
    );
    await dbPool.query(
      "UPDATE procurement_projects SET supplier_type = 'manufacturer_only' WHERE manufacturer_only = 1 AND (supplier_type IS NULL OR supplier_type = 'any')",
    );
  },
};
