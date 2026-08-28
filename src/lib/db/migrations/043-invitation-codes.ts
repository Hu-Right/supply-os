/**
 * 043: 邀请码与员工业绩追踪
 * invitation-codes
 *
 * 新建 crm_employees（员工表）和 crm_invitation_codes（邀请码表），
 * 为 crm_users 新增 referral_code / referral_employee_id 列，
 * 支持注册时必填邀请码并关联推荐员工业绩。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 43,
  name: "invitation-codes",
  async up(dbPool: Pool) {
    // ── 员工表 ─
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_employees (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '员工姓名',
        employee_no VARCHAR(50) NULL COMMENT '工号',
        department VARCHAR(100) NULL COMMENT '部门',
        kpi_target INT UNSIGNED NULL DEFAULT NULL COMMENT '个人KPI目标数（总注册量）',
        is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否在职',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_employee_no (employee_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── 邀请码表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_invitation_codes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(20) NOT NULL COMMENT '邀请码（格式 EMP-XXXXXXXX）',
        employee_id INT UNSIGNED NOT NULL COMMENT '关联员工',
        max_uses INT NULL DEFAULT NULL COMMENT '最大使用次数（NULL=无限）',
        used_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已使用次数',
        is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
        expires_at DATETIME NULL DEFAULT NULL COMMENT '过期时间（NULL=永不过期）',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_code (code),
        KEY idx_employee_id (employee_id),
        CONSTRAINT fk_invitation_employee FOREIGN KEY (employee_id)
          REFERENCES crm_employees(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── crm_users 新增推荐关联列 ──
    await ensureColumn(
      dbPool,
      "crm_users",
      "referral_code",
      "referral_code VARCHAR(20) NULL AFTER supplier_link_status",
    );

    await ensureColumn(
      dbPool,
      "crm_users",
      "referral_employee_id",
      "referral_employee_id INT UNSIGNED NULL AFTER referral_code",
    );

    await ensureIndex(
      dbPool,
      "crm_users",
      "idx_referral",
      "CREATE INDEX idx_referral ON crm_users (referral_employee_id, referral_code)",
    );

    // ── 种子数据：啊历（518）+ 许丹（222），各自独立 KPI 目标 ─
    await dbPool.query(`
      INSERT INTO crm_employees (name, department, kpi_target)
      VALUES ('啊历', '私域运营', 518),
             ('许丹', '私域运营', 222)
      ON DUPLICATE KEY UPDATE name = VALUES(name), kpi_target = VALUES(kpi_target)
    `);
  },
};
