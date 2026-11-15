/**
 * 迁移 026 · 删除采购需求主表的两处无效字段
 *
 * @module server/db/migrations/026-drop-project-dead-columns
 * @description 两个字段性质不同，但都属于「留着会误导后来者」：
 *
 *              **① `procurement_mode` —— 恒定值预留**
 *              迁移 011 建表时写死默认 'rfq'，全仓没有任何写入路径
 *              （不在 `PROJECT_EDITABLE_COLUMNS`，创建 INSERT 也不含它），
 *              更没有分支读它做决策，只有 `projectViewOf` 原样输出。
 *              P2 的「采购方式判定引擎」尚无排期，字段位本身不承载任何信息——
 *              等到真做 P2 时按当时的方式枚举重新加列，比留一个恒 'rfq' 的列更清楚。
 *
 *              **② `delivery_province` —— 读了但永远没数据**
 *              它是"有读取方、无写入源"的死链：
 *                · 不在 `PROJECT_EDITABLE_COLUMNS`（API 写不进）；
 *                · 创建项目的 INSERT 只写 7 列，其余走默认值（NULL）；
 *                · 前端向导没有省份字段，API 层也没有对应入参。
 *              于是 `matching.ts` 里那条"省份 +15 分"恒为 0、`denom` 恒不含这 15 分、
 *              `buildReasons` 的「省份」理由从未出现过。删除该列与删除那段加分逻辑
 *              **严格语义等价**（province 恒空 → 分子分母同时为 0）。
 *
 *              真要恢复省份匹配，正确做法是加结构化省份码（province_code char2），
 *              从交付地址或地区选择器产生，而不是复用这个从没被填过的自由文本列。
 *
 *              回滚（DDL 不可逆，只回结构不回数据）：
 *                ALTER TABLE procurement_projects
 *                  ADD COLUMN procurement_mode varchar(16) NOT NULL DEFAULT 'rfq',
 *                  ADD COLUMN delivery_province varchar(120) DEFAULT NULL;
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const RETIRED_COLUMNS = ["procurement_mode", "delivery_province"] as const;

export const migration: Migration = {
  version: 26,
  name: "drop_project_dead_columns",
  async up(dbPool: Pool): Promise<void> {
    for (const col of RETIRED_COLUMNS) {
      const [rows] = await dbPool.query(
        "SELECT 1 FROM information_schema.COLUMNS " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_projects' AND COLUMN_NAME = ? LIMIT 1",
        [col],
      );
      if ((rows as RowDataPacket[]).length === 0) continue; // 已删则跳过，重跑幂等
      await dbPool.query(`ALTER TABLE \`procurement_projects\` DROP COLUMN \`${col}\``);
    }
  },
};
