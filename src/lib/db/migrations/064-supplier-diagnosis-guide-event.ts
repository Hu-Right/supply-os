/**
 * 迁移 064 — 诊断引导卡曝光/点击/关闭埋点
 *
 * @description 右下角诊断引导卡（DiagnosisGuideCard）需要回答：有没有被看到、点了没有、
 *              是不是被直接关掉。只记录事件与主体，不记录页面内容。
 *              幂等：CREATE TABLE IF NOT EXISTS。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 64,
  name: "supplier_diagnosis_guide_event",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`supplier_diagnosis_guide_event\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
        \`user_id\` INT NOT NULL COMMENT '用户（users.id）',
        \`supplier_id\` INT DEFAULT NULL COMMENT '绑定主体（supplier.id，可空）',
        \`event\` VARCHAR(20) NOT NULL COMMENT '事件：impression/click/dismiss',
        \`path\` VARCHAR(200) DEFAULT NULL COMMENT '触发页面路径（不含查询串）',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件时间',
        PRIMARY KEY (\`id\`),
        KEY \`idx_guide_event_created\` (\`created_at\`),
        KEY \`idx_guide_event_type\` (\`event\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='诊断引导卡事件埋点'`,
    );
  },
};
