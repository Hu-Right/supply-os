/**
 * 049: 企业注册数据流归一化
 * evaluation-unification
 *
 * 将 crm_supplier_qualification 升级为统一的供应商评估表：
 *   - 新增 user_id / referral_employee_id / source 列，支持注册回写与 KPI 归属
 *   - 为 crm_users 新增 qualification_id 列，关联评估记录
 *
 * 三个入口（企业注册、扫码诊断、资质测试）统一写入同一张表。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 49,
  name: "evaluation-unification",
  async up(dbPool: Pool) {
    // ── 1. crm_supplier_qualification 新增关联列 ──

    await ensureColumn(
      dbPool,
      "crm_supplier_qualification",
      "user_id",
      "user_id BIGINT UNSIGNED NULL COMMENT '关联用户（注册后回写）' AFTER ip",
    );

    await ensureColumn(
      dbPool,
      "crm_supplier_qualification",
      "referral_employee_id",
      "referral_employee_id INT UNSIGNED NULL COMMENT '推荐员工（KPI归属）' AFTER user_id",
    );

    await ensureColumn(
      dbPool,
      "crm_supplier_qualification",
      "source",
      "source VARCHAR(30) NOT NULL DEFAULT 'qualification' COMMENT '来源: registration/diagnosis/qualification' AFTER referral_employee_id",
    );

    await ensureIndex(
      dbPool,
      "crm_supplier_qualification",
      "idx_eval_user",
      "CREATE INDEX idx_eval_user ON crm_supplier_qualification (user_id)",
    );

    await ensureIndex(
      dbPool,
      "crm_supplier_qualification",
      "idx_eval_employee",
      "CREATE INDEX idx_eval_employee ON crm_supplier_qualification (referral_employee_id)",
    );

    await ensureIndex(
      dbPool,
      "crm_supplier_qualification",
      "idx_eval_source",
      "CREATE INDEX idx_eval_source ON crm_supplier_qualification (source)",
    );

    // ── 2. crm_users 新增 qualification_id 关联列 ──

    await ensureColumn(
      dbPool,
      "crm_users",
      "qualification_id",
      "qualification_id BIGINT UNSIGNED NULL COMMENT '关联供应商评估记录' AFTER referral_employee_id",
    );

    await ensureIndex(
      dbPool,
      "crm_users",
      "idx_qualification",
      "CREATE INDEX idx_qualification ON crm_users (qualification_id)",
    );
  },
};
