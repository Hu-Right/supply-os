/**
 * 迁移 012 · 采购需求发布域——流程实体（授权书/核验/发布/匹配）
 *
 * @module server/db/migrations/012-procurement-flow
 * @description 七步流程第 4-7 步的数据落点：authorization(授权书签署,按项目+版本绑定) /
 *              reviews(核验记录,自动初审九项+人工核验) / tenders(正式发布) /
 *              matches(发布即匹配候选) / v_procurement_review_queue(站外评审后台只读入口)。
 *              DDL 幂等，表级字符集/排序/引擎显式统一（同 002/010 口径）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 审核队列视图（站外评审后台只读入口：submitted/under_review 的项目 + 授权与主体状态） */
const REVIEW_QUEUE_VIEW =
  "CREATE OR REPLACE VIEW `v_procurement_review_queue` AS " +
  "SELECT p.`id` AS `project_id`, p.`reference` AS `reference`, p.`version_no` AS `version`, " +
  "p.`title_zh` AS `title`, p.`primary_ugt_code` AS `primary_ugt_code`, " +
  "p.`budget_amount` AS `budget_amount`, p.`budget_currency` AS `budget_currency`, " +
  "p.`budget_public` AS `budget_public`, p.`purpose` AS `purpose`, " +
  "p.`delivery_country` AS `delivery_country`, p.`delivery_city` AS `delivery_city`, " +
  "b.`org_name` AS `buyer_org_name`, b.`org_type` AS `buyer_org_type`, b.`status` AS `buyer_status`, " +
  "p.`requirement_verify` AS `requirement_verify`, p.`fund_verify` AS `fund_verify`, " +
  "p.`submitted_at` AS `submitted_at`, " +
  "TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(p.`submitted_at`), NOW()) AS `waiting_minutes`, " +
  "a.`status` AS `auth_status`, a.`signer_name` AS `auth_signer_name`, " +
  "a.`signed_at` AS `auth_signed_at`, a.`scan_file_key` AS `auth_scan_file_key`, " +
  "a.`scan_file_hash` AS `auth_scan_file_hash` " +
  "FROM `procurement_projects` p " +
  "JOIN `procurement_buyers` b ON b.`id` = p.`buyer_id` " +
  "LEFT JOIN (SELECT project_id, version_no, MAX(id) AS latest_id " +
  "           FROM procurement_authorizations GROUP BY project_id, version_no) la " +
  "       ON la.project_id = p.id AND la.version_no = p.version_no " +
  "LEFT JOIN procurement_authorizations a ON a.id = la.latest_id " +
  "WHERE p.`status` IN ('submitted', 'under_review')";

const TABLES = [
  "CREATE TABLE IF NOT EXISTS `procurement_authorizations` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`version_no` INT UNSIGNED NOT NULL COMMENT '绑定的需求版本（版本变更授权失效须重签=授权书第五条）', " +
    "`letter_template_version` VARCHAR(8) NOT NULL DEFAULT 'v1' COMMENT '授权书模板版本', " +
    "`letter_hash` CHAR(64) NOT NULL COMMENT '签署所依据的授权书内容哈希（sha256）', " +
    "`method` VARCHAR(16) NOT NULL DEFAULT 'upload_scan' COMMENT '签署方式：upload_scan=签字盖章扫描件+在线确认', " +
    "`scan_file_key` VARCHAR(255) NOT NULL COMMENT '签字盖章扫描件（upload_files）', " +
    "`scan_file_hash` CHAR(64) NOT NULL COMMENT '扫描件哈希（sha256）', " +
    "`signer_name` VARCHAR(128) NOT NULL COMMENT '授权代表姓名', " +
    "`signer_uid` INT UNSIGNED NOT NULL COMMENT '平台账号', " +
    "`signed_at` INT UNSIGNED NOT NULL COMMENT '在线确认时刻（秒）', " +
    "`confirm_ip` VARCHAR(64) NULL COMMENT '在线确认 IP', " +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/verified/rejected', " +
    "`verified_by` VARCHAR(64) NULL COMMENT '核验人', " +
    "`verified_at` INT UNSIGNED NULL COMMENT '核验时间（秒）', " +
    "`reject_reason` VARCHAR(255) NULL COMMENT '核验拒绝原因', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "`updated_at` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "KEY `idx_pauth_project` (`project_id`,`version_no`,`status`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='发布授权书（流程第4/5步）：系统生成带编号授权书→签字盖章上传→在线确认→云境核验'",

  "CREATE TABLE IF NOT EXISTS `procurement_reviews` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`version_no` INT UNSIGNED NOT NULL COMMENT '核验的需求版本', " +
    "`stage` VARCHAR(20) NOT NULL COMMENT '核验环节：auto(系统自动初审)/identity(主体)/requirement(需求真实性)/feasibility(技术可招标性)/authorization(授权)/fund(资金)', " +
    "`result` VARCHAR(16) NOT NULL COMMENT '结论：pass/need_info/risk/reject', " +
    "`reviewer` VARCHAR(64) NOT NULL COMMENT '核验主体（system=规则引擎/审核员工号）', " +
    "`evidence` JSON NULL COMMENT '核验证据（自动初审九项明细/人工核验依据）', " +
    "`note` VARCHAR(500) NULL COMMENT '说明（需补充内容/风险提示）', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "KEY `idx_prev_project` (`project_id`,`version_no`,`stage`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='核验记录（F04/F05/F06）：四级审核留痕，AUTO-REVIEW-ID 即本表 id'",

  "CREATE TABLE IF NOT EXISTS `procurement_tenders` (" +
    "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`version_no` INT UNSIGNED NOT NULL COMMENT '发布的需求版本', " +
    "`tender_no` VARCHAR(40) NOT NULL COMMENT '正式发布编号（OSPT-{年}-{6位id}）', " +
    "`publish_mode` VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT '发布方式：public/targeted/prequalified', " +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'published' COMMENT 'published/closed/cancelled', " +
    "`published_at` INT UNSIGNED NOT NULL COMMENT '发布时间（秒）', " +
    "`deadline_at` INT UNSIGNED NULL COMMENT '截标时间（秒）', " +
    "`deadline_tz` VARCHAR(40) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT '截标时区', " +
    "`document_manifest` JSON NULL COMMENT '公开文件清单（文件名+哈希+版本）', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_tender_no` (`tender_no`), " +
    "KEY `idx_tender_project` (`project_id`,`version_no`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='正式发布（流程第7步）：发布即启动供应商智能匹配'",

  "CREATE TABLE IF NOT EXISTS `procurement_matches` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`supplier_id` INT UNSIGNED NOT NULL COMMENT '供应商 supplier.id', " +
    "`score` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '规则匹配得分（MVP：行业 L1 基础分+省份加分；评分模型 P3）', " +
    "`reasons` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '命中维度说明（行业/省份）', " +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'recommended' COMMENT 'recommended/invited', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '生成时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_match_project_supplier` (`project_id`,`supplier_id`), " +
    "KEY `idx_match_project` (`project_id`,`score`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='发布即匹配候选名单（规则版）：发布成功后生成，采购方工作台消费'",
];

export const migration: Migration = {
  version: 12,
  name: "procurement_flow",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of TABLES) {
      await dbPool.query(ddl);
    }
    await dbPool.query(REVIEW_QUEUE_VIEW);
  },
};
