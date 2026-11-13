/**
 * 迁移 010 · RFQ 需求域核心表（重构 v2）
 *
 * @module server/db/migrations/010-rfq-core
 * @description 把「用户自助发布采购需求」从 bid_notices（爬虫公告主表）迁出，
 *              建立独立的聚合根 rfq_demand 及其 7 张协作表。设计依据：
 *              docs/superpowers/specs/2026-11-13-RFQ需求发布流程-目标设计-v2.md
 *
 *              与旧结构的关系：
 *              - 旧表 rfq_quotes / rfq_invites / rfq_outreach / rfq_guard 保留不动，
 *                在 P2 迁移消费方后于收尾阶段退役；本迁移新建的 rfq_quote / rfq_invitation
 *                以 rfq_demand.id 为准，避免重构期两套语义互相污染。
 *              - bid_notices 降级为「搜索投影」：只由 services/rfq/projection 写入索引所需字段。
 *
 *              DDL 幂等（CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE VIEW），
 *              表级字符集/排序/引擎显式统一（check-ddl-collation 强制）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLES: string[] = [
  // ── 聚合根 ──
  "CREATE TABLE IF NOT EXISTS `rfq_demand` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`reference` VARCHAR(40) NOT NULL COMMENT '可读编号 OSRFQ-{年}-{6位序号}'," +
    "`buyer_user_id` BIGINT UNSIGNED NOT NULL COMMENT '采购方用户ID'," +
    "`buyer_org_name` VARCHAR(200) NULL COMMENT '采购方企业名（投影写 organization，不写 agency）'," +
    "`status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft/submitted/under_review/rejected/published/evaluation/closed'," +
    "`revision_no` INT NOT NULL DEFAULT 0 COMMENT '当前内容版本号；审核按版本绑定'," +
    "`title` VARCHAR(50) NOT NULL COMMENT '标题（业务上限 50，宽表容量 1000）'," +
    "`category_code` VARCHAR(24) NULL COMMENT 'UGT 叶节点码'," +
    "`province_code` VARCHAR(20) NULL," +
    "`province_name` VARCHAR(50) NULL," +
    "`purchase_type` VARCHAR(16) NULL COMMENT 'once/framework/long_term'," +
    "`quantity` DECIMAL(18,3) NULL," +
    "`quantity_unit` VARCHAR(20) NULL," +
    "`description` TEXT NULL COMMENT '需求描述（业务上限 2000，与宽表主列同口径）'," +
    "`budget_amount` DECIMAL(18,2) NULL COMMENT '预算金额（元）；保密时不落库为 0，而是保留金额+标记隐藏'," +
    "`budget_currency` VARCHAR(10) NOT NULL DEFAULT 'CNY'," +
    "`budget_confidential` TINYINT(1) NOT NULL DEFAULT 0," +
    "`incoterm` VARCHAR(16) NULL," +
    "`delivery_time` VARCHAR(64) NULL," +
    "`delivery_address` VARCHAR(255) NULL," +
    "`payment_terms` VARCHAR(255) NULL," +
    "`supplier_reqs` VARCHAR(500) NULL," +
    "`visibility` VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public/targeted'," +
    "`contact_name` VARCHAR(64) NULL," +
    "`contact_email` VARCHAR(128) NULL," +
    "`contact_phone` VARCHAR(32) NULL," +
    "`terms_version` VARCHAR(20) NULL COMMENT '《发布承诺》版本，用于存证'," +
    "`agreed_at` BIGINT NULL COMMENT '承诺勾选时点（秒）'," +
    "`open_at` BIGINT NULL COMMENT '报价开放时间（秒）；支持定时发布'," +
    "`close_at` BIGINT NULL COMMENT '报价截止（秒，按 Asia/Shanghai 日终折算）'," +
    "`submitted_at` BIGINT NULL COMMENT '提交审核时间（SLA 起点）'," +
    "`review_claimed_at` BIGINT NULL COMMENT '审核领取时间'," +
    "`reviewed_at` BIGINT NULL COMMENT '审核结论时间'," +
    "`reviewer_ref` VARCHAR(64) NULL COMMENT '审核方标识（工单号/审核人）'," +
    "`reject_reason` VARCHAR(500) NULL COMMENT '退回理由（>=10 字）'," +
    "`close_reason` VARCHAR(20) NULL COMMENT 'cancelled/expired/awarded/violated'," +
    "`notice_pk` INT NULL COMMENT '搜索投影行 bid_notices.id'," +
    "`created_at` BIGINT NOT NULL," +
    "`updated_at` BIGINT NOT NULL," +
    "PRIMARY KEY (`id`)," +
    "UNIQUE KEY `uq_demand_reference` (`reference`)," +
    "UNIQUE KEY `uq_demand_notice_pk` (`notice_pk`)," +
    "KEY `idx_demand_buyer` (`buyer_user_id`,`status`)," +
    "KEY `idx_demand_open` (`status`,`visibility`,`open_at`,`close_at`)," +
    "KEY `idx_demand_close` (`status`,`close_at`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 需求聚合根：用户自助发布的采购需求，业务态唯一事实源'",

  // ── 不可变版本快照 ──
  "CREATE TABLE IF NOT EXISTS `rfq_demand_revision` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`version` INT NOT NULL COMMENT '从 1 开始递增'," +
    "`snapshot` JSON NOT NULL COMMENT '提交时的完整字段快照（审核依据）'," +
    "`content_hash` CHAR(64) NOT NULL COMMENT '快照 SHA-256，用于去重与防篡改'," +
    "`created_at` BIGINT NOT NULL," +
    "`submitted_at` BIGINT NULL," +
    "PRIMARY KEY (`id`)," +
    "UNIQUE KEY `uq_revision_demand_version` (`demand_id`,`version`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 内容版本快照：审核绑定确定版本，改稿生成新版本'",

  // ── 审核工单 ──
  "CREATE TABLE IF NOT EXISTS `rfq_review_task` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`revision_no` INT NOT NULL," +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'queued/claimed/done/obsolete'," +
    "`sla_due_at` BIGINT NOT NULL COMMENT 'SLA 到期（秒）'," +
    "`claimed_by` VARCHAR(64) NULL," +
    "`claimed_at` BIGINT NULL," +
    "`decision` VARCHAR(16) NULL COMMENT 'approved/rejected'," +
    "`reason` VARCHAR(500) NULL," +
    "`decided_at` BIGINT NULL," +
    "`callback_id` VARCHAR(64) NULL COMMENT '回调幂等键'," +
    "`created_at` BIGINT NOT NULL," +
    "PRIMARY KEY (`id`)," +
    "UNIQUE KEY `uq_task_demand_rev` (`demand_id`,`revision_no`)," +
    "UNIQUE KEY `uq_task_callback` (`callback_id`)," +
    "KEY `idx_task_queue` (`status`,`sla_due_at`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 审核工单：评审后台从 v_rfq_review_queue 领取，结论经签名回调写回'",

  // ── 事件流（append-only） ──
  "CREATE TABLE IF NOT EXISTS `rfq_demand_event` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`type` VARCHAR(32) NOT NULL COMMENT 'created/submitted/claimed/approved/rejected/published/closed/edited/invited/quoted/awarded/qa'," +
    "`actor_type` VARCHAR(16) NOT NULL COMMENT 'buyer/reviewer/system'," +
    "`actor_id` BIGINT NULL," +
    "`from_status` VARCHAR(20) NULL," +
    "`to_status` VARCHAR(20) NULL," +
    "`payload` JSON NULL," +
    "`at_sec` BIGINT NOT NULL," +
    "PRIMARY KEY (`id`)," +
    "KEY `idx_event_demand` (`demand_id`,`id`)," +
    "KEY `idx_event_type` (`type`,`at_sec`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 事件流：状态/版本/邀约/报价/授标全过程留痕，时间线与审计的唯一来源'",

  // ── 邀约 ──
  "CREATE TABLE IF NOT EXISTS `rfq_invitation` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`supplier_user_id` BIGINT UNSIGNED NOT NULL," +
    "`source` VARCHAR(16) NOT NULL DEFAULT 'match' COMMENT 'match/manual'," +
    "`channel` VARCHAR(16) NOT NULL DEFAULT 'email'," +
    "`sent_at` BIGINT NULL," +
    "`accepted_at` BIGINT NULL," +
    "`unsubscribed_at` BIGINT NULL," +
    "`created_at` BIGINT NOT NULL," +
    "PRIMARY KEY (`id`)," +
    "UNIQUE KEY `uq_invitation_demand_supplier` (`demand_id`,`supplier_user_id`)," +
    "KEY `idx_invitation_supplier` (`supplier_user_id`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 邀约：定向需求的白名单与触达账本（含退订）'",

  // ── 密封报价 ──
  "CREATE TABLE IF NOT EXISTS `rfq_quote` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`revision_no` INT NOT NULL COMMENT '所报需求版本'," +
    "`supplier_user_id` BIGINT UNSIGNED NOT NULL," +
    "`version` INT NOT NULL DEFAULT 1 COMMENT '同一供应商的报价版本'," +
    "`is_current` TINYINT(1) NOT NULL DEFAULT 1," +
    "`price` DECIMAL(18,2) NOT NULL," +
    "`currency` VARCHAR(10) NOT NULL DEFAULT 'CNY'," +
    "`lead_days` INT NULL," +
    "`incoterm` VARCHAR(16) NULL," +
    "`validity_days` INT NULL," +
    "`note` VARCHAR(1000) NULL," +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'submitted' COMMENT 'submitted/withdrawn/won/lost'," +
    "`created_at` BIGINT NOT NULL," +
    "`updated_at` BIGINT NOT NULL," +
    "`withdrawn_at` BIGINT NULL," +
    "PRIMARY KEY (`id`)," +
    "UNIQUE KEY `uq_quote_demand_supplier_version` (`demand_id`,`supplier_user_id`,`version`)," +
    "KEY `idx_quote_current` (`demand_id`,`is_current`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 密封报价：截止前仅数量可见，历史版本保留'",

  // ── 答疑 ──
  "CREATE TABLE IF NOT EXISTS `rfq_qa` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`asker_user_id` BIGINT UNSIGNED NULL COMMENT 'null=采购方补充说明'," +
    "`question` VARCHAR(2000) NOT NULL," +
    "`answer` VARCHAR(2000) NULL," +
    "`answered_by` BIGINT UNSIGNED NULL," +
    "`answered_at` BIGINT NULL," +
    "`visibility` VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public/private'," +
    "`created_at` BIGINT NOT NULL," +
    "PRIMARY KEY (`id`)," +
    "KEY `idx_qa_demand` (`demand_id`,`id`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 答疑：截止前提问，答复对可见方广播'",

  // ── 授标 ──
  "CREATE TABLE IF NOT EXISTS `rfq_award` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "`demand_id` BIGINT UNSIGNED NOT NULL," +
    "`quote_id` BIGINT UNSIGNED NOT NULL," +
    "`supplier_user_id` BIGINT UNSIGNED NOT NULL," +
    "`reason` VARCHAR(500) NOT NULL COMMENT '授标理由（必填，留痕）'," +
    "`awarded_by` BIGINT UNSIGNED NOT NULL," +
    "`awarded_at` BIGINT NOT NULL," +
    "`revoked_at` BIGINT NULL," +
    "`revoke_reason` VARCHAR(500) NULL," +
    "PRIMARY KEY (`id`)," +
    "KEY `idx_award_demand` (`demand_id`,`awarded_at`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='RFQ 授标：记录中标报价、理由与撤销留痕'",
];

/** 审核队列视图：评审后台只读入口（字段即审核员所需最小集） */
const REVIEW_QUEUE_VIEW =
  "CREATE OR REPLACE VIEW `v_rfq_review_queue` AS " +
  "SELECT t.`id` AS `task_id`, d.`id` AS `demand_id`, d.`reference` AS `reference`, " +
  "t.`revision_no` AS `version`, d.`title` AS `title`, d.`category_code` AS `category_code`, " +
  "d.`budget_amount` AS `budget_amount`, d.`budget_currency` AS `budget_currency`, " +
  "d.`budget_confidential` AS `budget_confidential`, d.`visibility` AS `visibility`, " +
  "d.`province_name` AS `province_name`, d.`buyer_org_name` AS `buyer_org_name`, " +
  "d.`submitted_at` AS `submitted_at`, t.`sla_due_at` AS `sla_due_at`, " +
  "TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(d.`submitted_at`), NOW()) AS `waiting_minutes` " +
  "FROM `rfq_review_task` t JOIN `rfq_demand` d ON d.`id` = t.`demand_id` " +
  "WHERE t.`status` = 'queued'";

export const migration: Migration = {
  version: 10,
  name: "rfq_core",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of TABLES) {
      await dbPool.query(ddl);
    }
    await dbPool.query(REVIEW_QUEUE_VIEW);
  },
};
