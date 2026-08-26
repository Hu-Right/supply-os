/**
 * 041: 供应商国际招投标能力初筛表
 * 独立表，不影响现有 crm_supplier_claims
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 41,
  name: "supplier-qualification",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_supplier_qualification (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL COMMENT '企业名称',
        company_website VARCHAR(500) NOT NULL COMMENT '企业官网网址',
        founding_year VARCHAR(20) NULL COMMENT '企业成立年份',
        employee_count VARCHAR(40) NULL COMMENT '企业规模（员工人数）',
        industry VARCHAR(500) NOT NULL COMMENT '企业所属行业（逗号分隔）',
        other_industry VARCHAR(255) NULL COMMENT '其他行业（当industry包含"其他"时填写）',
        main_product VARCHAR(500) NOT NULL COMMENT '企业主营产品',
        export_scale VARCHAR(40) NOT NULL COMMENT '近2年出口/国际业务规模',
        certifications VARCHAR(1000) NOT NULL COMMENT '资质证书（逗号分隔）',
        other_certifications TEXT NULL COMMENT '其他资质证书',
        service_countries TEXT NOT NULL COMMENT '售后点/服务站/维修点所在国家',
        overseas_companies TEXT NOT NULL COMMENT '海外分公司/投资公司所在国家',
        ungm_status VARCHAR(40) NOT NULL COMMENT 'UNGM注册状态',
        english_team VARCHAR(40) NOT NULL COMMENT '英文团队能力',
        payment_terms VARCHAR(40) NOT NULL COMMENT '是否接受30天账期',
        bid_willingness VARCHAR(40) NOT NULL COMMENT '是否愿意参与投标',
        contact_info VARCHAR(255) NULL COMMENT '联系人微信及电话（bid_willingness=是时填写）',
        audit_status VARCHAR(30) NOT NULL DEFAULT 'pending' COMMENT '审核状态: pending/approved/rejected',
        ip VARCHAR(64) NULL COMMENT '提交IP',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_audit_status (audit_status),
        KEY idx_company_name (company_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
