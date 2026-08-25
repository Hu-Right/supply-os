/**
 * 041: 研修班报名数据融合
 * training-registration-consolidation
 *
 * @description 将报名表（crm_training_registrations）与学员表（training_participants）融合：
 *              - 报名表新增 participants JSON 字段，直接存储学员名单
 *              - 报名表新增 schedule_id / participant_count，承载期次与人数
 *              - 清理报名表中的历史遗留字段（legacy_supplier_id 等）
 *              - 清理订单表（training_orders）中的冗余联系人字段
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 41,
  name: "training-registration-consolidation",
  async up(dbPool: Pool) {
    // ── 1. crm_training_registrations：新增融合字段 ──
    await dbPool.query(`
      ALTER TABLE crm_training_registrations
        ADD COLUMN participants JSON NULL COMMENT '学员名单 JSON' AFTER remark,
        ADD COLUMN participant_count INT NOT NULL DEFAULT 1 COMMENT '参训人数' AFTER participants,
        ADD COLUMN schedule_id INT UNSIGNED NULL COMMENT '选择的期次 ID' AFTER participant_count
    `).catch(() => { /* 列已存在则跳过 */ });

    // ── 2. crm_training_registrations：清理历史遗留字段 ──
    await dbPool.query("ALTER TABLE crm_training_registrations DROP COLUMN legacy_supplier_id").catch(() => {});
    await dbPool.query("ALTER TABLE crm_training_registrations DROP COLUMN converted_supplier_id").catch(() => {});
    await dbPool.query("ALTER TABLE crm_training_registrations DROP COLUMN portal_supplier_id").catch(() => {});
    await dbPool.query("ALTER TABLE crm_training_registrations DROP COLUMN payment_status").catch(() => {});
    await dbPool.query("ALTER TABLE crm_training_registrations DROP COLUMN order_id").catch(() => {});

    // ── 3. training_orders：清理冗余联系人字段 ──
    await dbPool.query("ALTER TABLE training_orders DROP COLUMN contact_name").catch(() => {});
    await dbPool.query("ALTER TABLE training_orders DROP COLUMN telephone").catch(() => {});

    console.log("[migration-041] 研修班报名数据融合完成");
  },
};
