/**
 * 066: 业务表 user_key 列 NULL 化（Phase 4 约束放松前置）
 * user-key-nullable-relax
 *
 * 背景（〇.6 审计发现 P0）：代码侧业务表 INSERT 已停写 user_key（P3 写切换），
 * 但 12+ 张表的 user_key 列仍为 NOT NULL，且 sql_mode 含 STRICT_TRANS_TABLES——
 * 所有停写路径的 INSERT 运行时抛 1364（支付订单/订阅/权益/解锁/浏览/兴趣/画像/认领/
 * 资料购买/推荐权重，以及 auth.repo number 模式的 refresh_tokens 签发）。
 *
 * 本迁移将 crm_users 以外的全部 user_key 列放松为可空：
 * - 与迁移 062（UNIQUE KEY 已重建为 user_id 版本）配套，NULL 化不触发唯一约束冲突；
 * - NULL 语义 = "迁移后新增行，归属见 user_id"；
 * - 旧代码显式写入 user_key 的行为不受影响（向后兼容）；
 * - crm_users.user_key（登录凭据）保持 NOT NULL，不在此列。
 *
 * 放宽后须重跑 backfillUserIds 观察期对账（真孤儿行 user_id 保持 NULL，属已删用户）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 表 → user_key 列长度（保留各表现有定义，仅放松 NOT NULL） */
const TABLES: Array<{ name: string; length: number }> = [
  { name: "crm_notice_interests", length: 190 },
  { name: "crm_opportunity_unlocks", length: 190 },
  { name: "crm_user_interest_codes", length: 190 },
  { name: "crm_user_entitlements", length: 190 },
  { name: "crm_user_subscriptions", length: 190 },
  { name: "crm_payment_orders", length: 190 },
  { name: "crm_user_industry_prefs", length: 190 },
  { name: "crm_reco_weight_profile", length: 190 },
  { name: "crm_supplier_claims", length: 190 },
  { name: "crm_user_reco_feedback", length: 190 },
  { name: "crm_user_notice_views", length: 190 },
  { name: "crm_learning_material_purchases", length: 64 },
  { name: "crm_refresh_tokens", length: 255 },
  { name: "crm_consent_log", length: 64 },
  { name: "crm_password_resets", length: 190 },
  { name: "learning_orders", length: 190 },
];

export const migration: Migration = {
  version: 66,
  name: "user-key-nullable-relax",
  async up(dbPool: Pool) {
    for (const { name, length } of TABLES) {
      await dbPool.query(
        `ALTER TABLE \`${name}\` MODIFY \`user_key\` VARCHAR(${length}) ` +
        `CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL`
      );
    }
    console.log("[migration-066] 业务表 user_key 列已全部放松为可空（14 表）");
  },
};
