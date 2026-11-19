/**
 * 迁移 060 — 供应商诊断提交结果埋点表
 *
 * @description 背景（2026-11-19）：诊断提交量长期为 0，但无法区分「没人来」还是
 *              「来了被 400/403 拦住」。本表只记录提交结果（成功/拒绝/异常）与错误码，
 *              供运营按天聚合、定位卡点；不记录答案内容，避免把企业填报数据再存一份。
 *
 *              幂等：CREATE TABLE IF NOT EXISTS。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 60,
  name: "supplier_diagnosis_submit_log",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`supplier_diagnosis_submit_log\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
        \`user_id\` INT NOT NULL COMMENT '提交用户（users.id）',
        \`supplier_id\` INT DEFAULT NULL COMMENT '命中的供应商主键（未确定时为空）',
        \`company_name\` VARCHAR(255) DEFAULT NULL COMMENT '用户填写的公司名（仅用于定位，不存答案）',
        \`result\` VARCHAR(20) NOT NULL COMMENT '提交结果：success/rejected/error',
        \`error_code\` VARCHAR(20) DEFAULT NULL COMMENT '失败错误码（如 40001/40060/403）',
        \`reason\` VARCHAR(100) DEFAULT NULL COMMENT '失败原因：bad_json/entity_not_found/write_gate/...',
        \`score_total\` DECIMAL(5,1) DEFAULT NULL COMMENT '成功时的总分（0-100）',
        \`client_ip\` VARCHAR(64) DEFAULT NULL COMMENT '提交 IP（反滥用审计，可空）',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
        PRIMARY KEY (\`id\`),
        KEY \`idx_diag_submit_created\` (\`created_at\`),
        KEY \`idx_diag_submit_result\` (\`result\`, \`error_code\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商诊断提交结果埋点'`,
    );
  },
};
