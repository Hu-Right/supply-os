/**
 * 迁移 011 · RFQ 授权书
 *
 * @module server/db/migrations/011-rfq-authorization
 * @description 落地《采购需求发布与供应商智能匹配授权书》流程（2026-11-14 用户拍板七步流程
 *              第 4/5/6 步）：授权按「需求编号 + 版本」绑定（对应 rfq_demand.reference +
 *              revision_no），重大变更（新 revision）授权失效须重签；签署 = 上传签字盖章
 *              扫描件 + 平台在线确认（身份/时间/IP/文件哈希），状态 pending → verified/rejected
 *              由云境核验，verified 为发布前置条件（applyReviewDecision 闸口）。
 *              v_rfq_review_queue 视图扩展：评审后台需看到当前版本授权的签署与核验状态。
 *              DDL 幂等，表级字符集/排序/引擎显式统一（同 002/010 口径）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 审核队列视图（在 010 基础上追加当前版本授权的签署/核验状态列） */
const REVIEW_QUEUE_VIEW =
  "CREATE OR REPLACE VIEW `v_rfq_review_queue` AS " +
  "SELECT t.`id` AS `task_id`, d.`id` AS `demand_id`, d.`reference` AS `reference`, " +
  "t.`revision_no` AS `version`, d.`title` AS `title`, d.`category_code` AS `category_code`, " +
  "d.`budget_amount` AS `budget_amount`, d.`budget_currency` AS `budget_currency`, " +
  "d.`budget_confidential` AS `budget_confidential`, d.`visibility` AS `visibility`, " +
  "d.`province_name` AS `province_name`, d.`buyer_org_name` AS `buyer_org_name`, " +
  "d.`submitted_at` AS `submitted_at`, t.`sla_due_at` AS `sla_due_at`, " +
  "TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(d.`submitted_at`), NOW()) AS `waiting_minutes`, " +
  "a.`status` AS `auth_status`, a.`method` AS `auth_method`, a.`signer_name` AS `auth_signer_name`, " +
  "a.`signed_at` AS `auth_signed_at`, a.`file_key` AS `auth_file_key`, a.`file_hash` AS `auth_file_hash` " +
  "FROM `rfq_review_task` t JOIN `rfq_demand` d ON d.`id` = t.`demand_id` " +
  "LEFT JOIN (SELECT demand_id, revision_no, MAX(id) AS latest_id " +
  "           FROM rfq_demand_authorization GROUP BY demand_id, revision_no) la " +
  "       ON la.demand_id = t.demand_id AND la.revision_no = t.revision_no " +
  "LEFT JOIN rfq_demand_authorization a ON a.id = la.latest_id " +
  "WHERE t.`status` = 'queued'";

export const migration: Migration = {
  version: 11,
  name: "rfq_authorization",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "CREATE TABLE IF NOT EXISTS `rfq_demand_authorization` (" +
        "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "`demand_id` INT UNSIGNED NOT NULL COMMENT '关联 rfq_demand.id', " +
        "`revision_no` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本（revision 变更授权失效须重签）', " +
        "`method` VARCHAR(16) NOT NULL DEFAULT 'upload_scan' COMMENT '签署方式：upload_scan=签字盖章扫描件+在线确认', " +
        "`letter_hash` CHAR(64) NOT NULL COMMENT '签署所依据的授权书内容哈希（sha256，模板+编号+版本+主体）', " +
        "`file_key` VARCHAR(255) NOT NULL COMMENT '签署扫描件（upload_files 字节入库文件名）', " +
        "`file_hash` CHAR(64) NOT NULL COMMENT '扫描件内容哈希（sha256）', " +
        "`signer_name` VARCHAR(128) NOT NULL COMMENT '签署人姓名（授权代表）', " +
        "`signer_uid` INT UNSIGNED NOT NULL COMMENT '平台账号 user_id', " +
        "`signed_at` INT UNSIGNED NOT NULL COMMENT '在线确认时刻（秒）', " +
        "`confirm_ip` VARCHAR(64) NULL COMMENT '在线确认 IP', " +
        "`status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/verified/rejected', " +
        "`verified_by` VARCHAR(64) NULL COMMENT '核验人（云境审核员）', " +
        "`verified_at` INT UNSIGNED NULL COMMENT '核验时间（秒）', " +
        "`reject_reason` VARCHAR(255) NULL COMMENT '核验拒绝原因', " +
        "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
        "`updated_at` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）', " +
        "PRIMARY KEY (`id`), " +
        "KEY `idx_auth_demand_rev` (`demand_id`,`revision_no`,`status`), " +
        "KEY `idx_auth_file` (`file_key`) " +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
        "COMMENT='RFQ 发布授权书：按需求编号+版本绑定，签署扫描件+在线确认，verified 为发布前置条件'",
    );
    await dbPool.query(REVIEW_QUEUE_VIEW);
  },
};
