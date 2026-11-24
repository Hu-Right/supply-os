/**
 * 迁移 075 · 供应商证据台账（2026-11-24）
 *
 * @module lib/db/migrations/075-supplier-evidence
 * @description 「补齐待办」里的每条要求都需要证据材料，但原来只有一段文字要求，
 *              没法回答"这份证到底有没有、谁签的、什么时候到期、存在哪"。
 *              本表只登记**元数据**（不上传文件本体）：清单项 key + 证据名 + 签发方 +
 *              有效期 + 存放位置，便于投标前逐项核对与到期提醒。
 *
 *              幂等：CREATE TABLE IF NOT EXISTS。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 75,
  name: "supplier_evidence",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`supplier_evidence\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`supplier_id\` BIGINT UNSIGNED NOT NULL COMMENT '企业主体（supplier.id）',
        \`checklist_key\` VARCHAR(80) NOT NULL COMMENT '对应补齐待办项：<市场>|<标准>',
        \`name\` VARCHAR(200) NOT NULL COMMENT '证据名称（如 CE DoC、ISO9001 证书）',
        \`issuer\` VARCHAR(120) DEFAULT NULL COMMENT '签发方 / 公告机构',
        \`valid_from\` DATE DEFAULT NULL,
        \`valid_to\` DATE DEFAULT NULL COMMENT '有效期至；NULL=长期有效',
        \`location\` VARCHAR(300) DEFAULT NULL COMMENT '存放位置（共享盘路径 / 档案柜编号）',
        \`note\` VARCHAR(500) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_supplier_checklist_name\` (\`supplier_id\`, \`checklist_key\`, \`name\`),
        KEY \`idx_supplier\` (\`supplier_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业证据台账（V3 补齐待办的证据元数据）'`,
    );
  },
};
