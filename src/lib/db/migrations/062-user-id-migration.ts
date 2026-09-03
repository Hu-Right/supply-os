/**
 * 062: user_id 内部化迁移
 * user-id-migration
 *
 * @description user_key（手机号/邮箱形态）退役为仅 crm_users 本表的登录凭据，
 *              所有业务表统一以 user_id（crm_users.id, BIGINT）作为跨表关联键。
 *
 *              本迁移完成：
 *              1. B 类表（缺 user_id 列）加列 + 索引
 *              2. A 类中标记"⚠️ 待核"的表补列（crm_user_industry_prefs / crm_user_reco_feedback）
 *              3. 含 user_key 的 UNIQUE KEY 重建为 user_id 版本（防止 Phase 4 置 NULL 时唯一约束冲突）
 *              4. 为所有业务表的 user_id 列添加查询索引
 *
 *              回填由 backfills.ts → backfillUserIds() 在启动阶段完成（幂等、分批限速）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 62,
  name: "user-id-migration",
  async up(dbPool: Pool) {
    // ── 1. B 类表：加 user_id 列 ──────────────────────────────────────────────

    // crm_password_resets（auth 域，验证码表）
    await ensureColumn(dbPool, "crm_password_resets", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_refresh_tokens（auth 域，刷新令牌表）
    await ensureColumn(dbPool, "crm_refresh_tokens", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_reco_weight_profile（推荐权重画像）
    await ensureColumn(dbPool, "crm_reco_weight_profile", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_chat_sessions（客服会话，列名 customer_id 保留语义，新增 user_id 列）
    await ensureColumn(dbPool, "crm_chat_sessions", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_learning_material_purchases（学习资料购买记录）
    await ensureColumn(dbPool, "crm_learning_material_purchases", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // training_orders（培训订单，代码中表名无 crm_ 前缀）
    await ensureColumn(dbPool, "training_orders", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // learning_orders（学习资料订单，代码中表名无 crm_ 前缀）
    await ensureColumn(dbPool, "learning_orders", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_user_search_log（搜索行为流水）
    await ensureColumn(dbPool, "crm_user_search_log", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // ── 2. A 类"⚠️ 待核"表：补 user_id 列 ────────────────────────────────────

    // crm_user_industry_prefs（行业偏好，003 迁移创建但无 user_id）
    await ensureColumn(dbPool, "crm_user_industry_prefs", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    // crm_user_reco_feedback（推荐反馈，004 迁移已有 user_id 列但标注待核——ensureColumn 幂等跳过）
    await ensureColumn(dbPool, "crm_user_reco_feedback", "user_id",
      "user_id BIGINT UNSIGNED NULL AFTER id");

    console.log("[migration-062] B 类 + 待核表 user_id 列补全完成");

    // ── 3. UNIQUE KEY 重建（user_key → user_id）──────────────────────────────
    // 必须先删旧索引再建新索引，避免同名冲突。
    // 使用 DROP INDEX IF EXISTS 语法（MySQL 8.0+ / MariaDB 10.1.4+ 支持）。

    const dropAndRecreateUnique = async (
      table: string,
      oldIndex: string,
      newIndex: string,
      columns: string,
    ) => {
      // 安全删除旧索引（不存在则跳过）
      const [idxRows] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, oldIndex],
      );
      if (Number((idxRows as any[])[0]?.total || 0) > 0) {
        await dbPool.query(`ALTER TABLE \`${table}\` DROP INDEX \`${oldIndex}\``);
      }
      // 创建新索引（ensureIndex 幂等）
      await ensureIndex(dbPool, table, newIndex,
        `ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${newIndex}\` (${columns})`);
    };

    // crm_opportunity_unlocks: (user_key, opportunity_id) → (user_id, opportunity_id)
    await dropAndRecreateUnique("crm_opportunity_unlocks",
      "uk_user_opportunity", "uk_user_opportunity", "user_id, opportunity_id");

    // crm_notice_interests: (user_key, notice_id, interest_type) → (user_id, notice_id, interest_type)
    await dropAndRecreateUnique("crm_notice_interests",
      "uk_user_notice_type", "uk_user_notice_type", "user_id, notice_id, interest_type");

    // crm_user_interest_codes: (user_key, code, source) → (user_id, code, source)
    await dropAndRecreateUnique("crm_user_interest_codes",
      "uk_user_code_source", "uk_user_code_source", "user_id, code, source");

    // crm_user_industry_prefs: (user_key) → (user_id)
    await dropAndRecreateUnique("crm_user_industry_prefs",
      "uk_user_pref", "uk_user_pref", "user_id");

    // crm_user_reco_feedback: (user_key, notice_id, session_id, action) → (user_id, notice_id, session_id, action)
    await dropAndRecreateUnique("crm_user_reco_feedback",
      "uk_dedup", "uk_dedup", "user_id, notice_id, session_id, action");

    // crm_reco_weight_profile: (user_key) → (user_id)
    await dropAndRecreateUnique("crm_reco_weight_profile",
      "uk_user", "uk_user", "user_id");

    // crm_learning_material_purchases: (user_key, material_id) → (user_id, material_id)
    await dropAndRecreateUnique("crm_learning_material_purchases",
      "uk_user_material", "uk_user_material", "user_id, material_id");

    console.log("[migration-062] UNIQUE KEY 重建完成（user_key → user_id）");

    // ── 4. 普通索引：为 user_id 列添加查询索引 ────────────────────────────────

    await ensureIndex(dbPool, "crm_password_resets", "idx_user_id",
      "ALTER TABLE crm_password_resets ADD INDEX idx_user_id (user_id)");
    await ensureIndex(dbPool, "crm_refresh_tokens", "idx_user_id",
      "ALTER TABLE crm_refresh_tokens ADD INDEX idx_user_id (user_id)");
    await ensureIndex(dbPool, "crm_chat_sessions", "idx_user_id",
      "ALTER TABLE crm_chat_sessions ADD INDEX idx_user_id (user_id)");
    await ensureIndex(dbPool, "learning_orders", "idx_lo_user_id",
      "ALTER TABLE learning_orders ADD INDEX idx_lo_user_id (user_id, status)");
    await ensureIndex(dbPool, "training_orders", "idx_to_user_id",
      "ALTER TABLE training_orders ADD INDEX idx_to_user_id (user_id)");
    await ensureIndex(dbPool, "crm_user_search_log", "idx_user_id",
      "ALTER TABLE crm_user_search_log ADD INDEX idx_user_id (user_id)");

    // 已有 user_id 列但缺索引的 A 类表
    await ensureIndex(dbPool, "crm_user_industry_prefs", "idx_user_id",
      "ALTER TABLE crm_user_industry_prefs ADD INDEX idx_user_id (user_id)");

    console.log("[migration-062] 普通索引添加完成");
    console.log("[migration-062] 全部完成——user_id 列 + UNIQUE KEY + 索引已就绪，等待 backfill 回填数据");
  },
};
