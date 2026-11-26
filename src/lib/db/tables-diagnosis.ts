/**
 * 诊断扩展表（V3）——建表 DDL 集中在这里，启动时幂等确保存在
 *
 * @module lib/db/tables-diagnosis
 * @description 2026-11-24 用户口径：**新表直接建**，不要为"建一张新表"写编号迁移。
 *              迁移只用于「改已有表结构」（且改表要走影子换表，见 076）。
 *              本模块只做 `CREATE TABLE IF NOT EXISTS` + 种子数据 `INSERT IGNORE`，
 *              由 `ensureProcurementSchema()` 在启动时调用，对新老库都安全。
 */
import type { Pool } from "mysql2/promise";

const SUPPLIER_EVIDENCE_DDL = `
CREATE TABLE IF NOT EXISTS \`supplier_evidence\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`supplier_id\` BIGINT UNSIGNED NOT NULL COMMENT '企业主体（supplier.id）',
  \`checklist_key\` VARCHAR(80) NOT NULL COMMENT '对应补齐待办项：<市场>|<标准>',
  \`name\` VARCHAR(200) NOT NULL COMMENT '证据名称',
  \`issuer\` VARCHAR(120) DEFAULT NULL COMMENT '签发方 / 公告机构',
  \`valid_from\` DATE DEFAULT NULL,
  \`valid_to\` DATE DEFAULT NULL COMMENT '有效期至；NULL=长期有效',
  \`location\` VARCHAR(300) DEFAULT NULL COMMENT '存放位置',
  \`note\` VARCHAR(500) DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_supplier_checklist_name\` (\`supplier_id\`, \`checklist_key\`, \`name\`),
  KEY \`idx_supplier\` (\`supplier_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业证据台账（只登记元数据）'`;

/** 幂等建表；启动时由 ensureProcurementSchema 调用
 *  2026-11-26：市场要求条目改由 supplier_certifications(requirement_kind) 派生，
 *  market_requirement 不再建表/灌种子（存量表等门户新版本上线后删除）。 */
export async function ensureDiagnosisExtensionTables(pool: Pool): Promise<void> {
  await pool.query(SUPPLIER_EVIDENCE_DDL);
}
