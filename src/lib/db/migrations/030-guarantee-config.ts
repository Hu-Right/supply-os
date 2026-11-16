/**
 * 迁移 030 · 保函/质保金结构化
 *
 * @module server/db/migrations/030-guarantee-config
 * @description `guarantees` 原先只存类型（逗号分隔），无法表达形式（银行/保险/现金）、
 *              比例或金额、有效期/退还节点。新增 guarantee_config JSON，类型列表仍写回
 *              guarantees 兼容旧接口与历史数据。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 30,
  name: "guarantee_config",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "guarantee_config",
      "guarantee_config JSON DEFAULT NULL COMMENT '保函/质保金要求：[{type,otherName,form,basis,value,note}]；guarantees 保留类型列表'",
    );
  },
};
