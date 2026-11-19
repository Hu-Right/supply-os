/**
 * 迁移 059 — 供应商询盘线索表
 *
 * @description 背景（2026-11-19）：供应商企业主页改版后，「发询盘」从纯 VIP 联系方式弹窗
 *              升级为可提交需求的线索入口。非 VIP 用户也应能把采购需求留给平台/企业，
 *              否则唯一动作是升级提示，线索直接流失。
 *
 *              设计：只存提交事实（供应商、用户、需求、可选联系方式），不存联系方式明文
 *              以外的敏感数据；处理后状态由运营在后台推进（new/contacted/closed/spam）。
 *              幂等：CREATE TABLE IF NOT EXISTS。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 59,
  name: "supplier_inquiry",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`supplier_inquiry\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
        \`supplier_id\` INT NOT NULL COMMENT '供应商主键（supplier.id）',
        \`user_id\` INT NOT NULL COMMENT '提交用户（users.id）',
        \`contact_name\` VARCHAR(100) DEFAULT NULL COMMENT '联系人姓名（用户填写，可空）',
        \`contact_phone\` VARCHAR(50) DEFAULT NULL COMMENT '联系电话（用户填写，可空）',
        \`contact_email\` VARCHAR(200) DEFAULT NULL COMMENT '联系邮箱（用户填写，可空）',
        \`demand\` TEXT NOT NULL COMMENT '采购需求描述',
        \`quantity\` VARCHAR(100) DEFAULT NULL COMMENT '预计数量/规模（自由文本，可空）',
        \`locale\` VARCHAR(10) NOT NULL DEFAULT 'zh' COMMENT '提交语言（zh/en/...）',
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'new' COMMENT '处理状态：new/contacted/closed/spam',
        \`source\` VARCHAR(30) NOT NULL DEFAULT 'supplier_profile' COMMENT '来源页面标识',
        \`client_ip\` VARCHAR(64) DEFAULT NULL COMMENT '提交 IP（反滥用审计，可空）',
        \`user_agent\` VARCHAR(500) DEFAULT NULL COMMENT 'User-Agent（反滥用审计，可空）',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
        PRIMARY KEY (\`id\`),
        KEY \`idx_inquiry_supplier\` (\`supplier_id\`, \`created_at\`),
        KEY \`idx_inquiry_user\` (\`user_id\`, \`created_at\`),
        KEY \`idx_inquiry_status\` (\`status\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商询盘线索'`,
    );
  },
};
