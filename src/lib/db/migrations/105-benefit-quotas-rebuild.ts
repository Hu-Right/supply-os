/**
 * 105: 权益额度账本 · 从头重建（保守精简终态 · id 归零）
 * benefit-quotas-rebuild
 *
 * @description 把 crm_benefit_quotas 推倒重建为一张干净的新表：
 *              - 顺带对齐「迁移 / 文档 / 生产」三方的席位退役漂移——092 的历史 DDL 仍带
 *                `scope` + `seat_user_id`，而生产 2026-09-29 已直接 DROP scope、seat_user_id
 *                改名 user_id（未迁移化）；本迁移把终态写进账本，新环境重放 001→105
 *                即得到与生产一致、无残列的表结构；
 *              - 保守精简：保留 `period` / `period_starts_at`（周期重置能力为价格文档 06 章
 *                "每月1次顾问咨询/年12次"预留，当前写入路径虽恒为 none 但不删能力）与生成列
 *                `subscription_pool_key`（让普通用户池的 NULL 参与唯一键、同时保住外键完整性）；
 *              - 清空重建：DROP + CREATE 空表，AUTO_INCREMENT 归 1，历史 quota_used 一并清零
 *                （额度池在下次消耗/发放时按矩阵懒物化重建）。裁决依据：订阅者全为内部人员、
 *                权益均经后台发放，账本数据可重写。
 *
 *              ⚠️ 破坏性：执行会清空 crm_benefit_quotas 全部行。仅因当前无外部付费用户才安全。
 *                 无任何表以 FK 指向 crm_benefit_quotas.id，故 DROP 不波及其他表。
 *
 *              结构要点与 092 一致（"1 就是 1"原则）：不限 = quota_total=-1 显式表达；
 *              uk_pool 含周期起点使"一池一周期一行"、重置=推进 period_starts_at 开新行留账；
 *              chk_usage 借 GREATEST 让 -1 不限行天然通过。重建后应用读写的列集与之前完全一致，
 *              故 benefit-write / benefit-system / upgrade / unlock-quota 及 verify-benefit-constraints
 *              （事实表基线本就取 0）均无需改动。
 *
 *              幂等：DROP IF EXISTS + CREATE，重跑得到同样的空终态表；版本由 runner 账本追踪。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const DDL_DROP = `DROP TABLE IF EXISTS crm_benefit_quotas`;

const DDL_CREATE = `
  CREATE TABLE crm_benefit_quotas (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subscription_id       BIGINT UNSIGNED NULL COMMENT 'FK crm_plan_subscriptions：额度随订阅生灭；NULL=普通用户池（免费档计量权益）',
    subscription_pool_key BIGINT GENERATED ALWAYS AS (IFNULL(subscription_id, 0)) STORED COMMENT '生成列：把普通用户池的 NULL 归一为 0，使其可参与唯一约束',
    user_id               BIGINT UNSIGNED NOT NULL COMMENT '额度持有用户：订阅共享池记主账号，普通用户池记本人（席位退役后由 seat_user_id 改名）',
    benefit_code          VARCHAR(64)  NOT NULL COMMENT 'FK crm_benefit_catalog：本池计量哪种权益（须 is_consumable=1）',
    quota_total           INT          NOT NULL COMMENT '总额度；-1=不限（不限行不记消耗）',
    quota_used            INT          NOT NULL DEFAULT 0 COMMENT '已用量；quota_total=-1 时恒为 0',
    period                ENUM('none','monthly','yearly') NOT NULL DEFAULT 'none' COMMENT '周期口径：一次性 / 每月重置 / 每年重置（如"每月1次顾问咨询"）',
    period_starts_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '当前周期起点；周期重置=推进本值开新行，旧行留账可对账',
    status                ENUM('active','exhausted','frozen','expired') NOT NULL DEFAULT 'active' COMMENT '仅 active 可扣减',
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pool (subscription_pool_key, user_id, benefit_code, period_starts_at),
    KEY idx_consume (user_id, benefit_code, status, period_starts_at),
    KEY idx_subscription (subscription_id, status),
    CONSTRAINT fk_quota_sub     FOREIGN KEY (subscription_id) REFERENCES crm_plan_subscriptions (id),
    CONSTRAINT fk_quota_benefit FOREIGN KEY (benefit_code)    REFERENCES crm_benefit_catalog (benefit_code),
    CONSTRAINT chk_usage CHECK (quota_used BETWEEN 0 AND GREATEST(quota_total, 0))
  ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='权益额度账本表：按（订阅 × 用户 × 权益 × 周期）记录可消耗额度的总量与已用量，是全库唯一的额度扣减落点'`;

/** 重建后期望存在的终态列（缺失=半套，须报错阻断） */
const EXPECTED_COLUMNS = [
  "id",
  "subscription_id",
  "subscription_pool_key",
  "user_id",
  "benefit_code",
  "quota_total",
  "quota_used",
  "period",
  "period_starts_at",
  "status",
  "created_at",
  "updated_at",
];

/** 席位退役后不得再出现的残列（存在=漂移未清，须报错） */
const RESIDUAL_COLUMNS = ["scope", "seat_user_id"];

export const migration: Migration = {
  version: 105,
  name: "benefit-quotas-rebuild",
  async up(dbPool: Pool) {
    await dbPool.query(DDL_DROP);
    await dbPool.query(DDL_CREATE);

    // 结构自检：确认重建后列集为终态——防"半套"表（缺列或残列未清）
    const [rows] = await dbPool.query(
      `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_benefit_quotas'`,
    );
    const got = new Set((rows as Array<{ c: string }>).map((r) => r.c));

    const missing = EXPECTED_COLUMNS.filter((c) => !got.has(c));
    if (missing.length > 0) {
      throw new Error(`[migration-105] 重建后缺失列：${missing.join(", ")}`);
    }
    const residual = RESIDUAL_COLUMNS.filter((c) => got.has(c));
    if (residual.length > 0) {
      throw new Error(`[migration-105] 重建后仍残留退役列：${residual.join(", ")}`);
    }

    console.log(
      "[migration-105] crm_benefit_quotas 已从头重建为无残列的终态空表（id 从 1 起；额度池将按需懒物化）",
    );
  },
};
