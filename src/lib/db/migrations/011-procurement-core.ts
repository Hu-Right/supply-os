/**
 * 迁移 011 · 采购需求发布域——核心实体（P1 全实体，2026-11-14 用户拍板整体替换旧 RFQ v2）
 *
 * @module server/db/migrations/011-procurement-core
 * @description 按《云境OS全球采购需求智能分类》全案 §11 + 七步发布流程重建数据模型，
 *              与旧 rfq_demand 域零映射（旧表由迁移 013 归档）。本迁移建六张核心表：
 *              buyers(主体认证) / buyer_verifications(核验留痕) / projects(需求主表) /
 *              lots(标包) / items(明细,UGT 码) / attachments(需求附件,按版本绑定) /
 *              revisions(版本快照,提交=确认版本)。UNSPSC 已全面退役：明细挂 UGT 树码
 *              （commodity_backbone）。DDL 幂等，表级字符集/排序/引擎显式统一（同 002/010 口径）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLES = [
  "CREATE TABLE IF NOT EXISTS `procurement_buyers` (" +
    "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`user_id` INT UNSIGNED NOT NULL COMMENT '平台账号（一个账号一个采购主体）', " +
    "`org_name` VARCHAR(255) NOT NULL COMMENT '采购主体完整法定名称', " +
    "`org_type` VARCHAR(32) NOT NULL DEFAULT 'private' COMMENT '主体类型：government/international_org/ngo/state_owned/private/trader/epc/agent', " +
    "`buyer_role` VARCHAR(32) NOT NULL DEFAULT 'end_buyer' COMMENT '采购权限：end_buyer/authorized_agent/general_contractor/intermediary', " +
    "`country` VARCHAR(80) NULL COMMENT '注册国家', " +
    "`address` VARCHAR(500) NULL COMMENT '注册地址', " +
    "`reg_no` VARCHAR(120) NULL COMMENT '注册号码', " +
    "`tax_no` VARCHAR(120) NULL COMMENT '税务编号', " +
    "`website` VARCHAR(255) NULL COMMENT '官方网站', " +
    "`official_email` VARCHAR(200) NULL COMMENT '企业邮箱', " +
    "`official_phone` VARCHAR(50) NULL COMMENT '联系电话', " +
    "`leader_name` VARCHAR(120) NULL COMMENT '采购项目负责人姓名', " +
    "`leader_title` VARCHAR(120) NULL COMMENT '负责人职务', " +
    "`leader_phone` VARCHAR(50) NULL COMMENT '负责人电话', " +
    "`leader_email` VARCHAR(200) NULL COMMENT '负责人邮箱', " +
    "`deliver_country` VARCHAR(80) NULL COMMENT '采购地区（产品最终使用/交付国）', " +
    "`deliver_city` VARCHAR(120) NULL COMMENT '采购城市', " +
    "`fund_source` VARCHAR(32) NULL COMMENT '资金来源：own/government_budget/loan/donation/project_special', " +
    "`budget_status` VARCHAR(32) NULL COMMENT '预算状态：approved/partial/pending/applying', " +
    "`external_rules` VARCHAR(255) NULL COMMENT '须遵守的外部采购规则（世行/联合国/政府等）', " +
    "`license_file_key` VARCHAR(255) NULL COMMENT '营业执照/注册文件（upload_files 文件名）', " +
    "`license_file_hash` CHAR(64) NULL COMMENT '执照文件哈希（sha256）', " +
    "`status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '认证状态：pending/verified/need_info/restricted（未认证可存草稿不可发布）', " +
    "`verified_by` VARCHAR(64) NULL COMMENT '核验人', " +
    "`verified_at` INT UNSIGNED NULL COMMENT '核验时间（秒）', " +
    "`verify_note` VARCHAR(500) NULL COMMENT '核验意见/需补充说明', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "`updated_at` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_buyer_user` (`user_id`), " +
    "KEY `idx_buyers_status` (`status`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='采购方主体（F01）：身份与采购权限认证，verified 为正式发布前置'",

  "CREATE TABLE IF NOT EXISTS `procurement_buyer_verifications` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`buyer_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_buyers.id', " +
    "`kind` VARCHAR(16) NOT NULL COMMENT '核验维度：identity/fund/authorization', " +
    "`result` VARCHAR(16) NOT NULL COMMENT '结论：pass/need_info/reject', " +
    "`evidence_file_key` VARCHAR(255) NULL COMMENT '证据文件（upload_files）', " +
    "`evidence_hash` CHAR(64) NULL COMMENT '证据文件哈希', " +
    "`reviewer` VARCHAR(64) NOT NULL COMMENT '核验人（云境审核员）', " +
    "`note` VARCHAR(500) NULL COMMENT '核验说明', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "KEY `idx_pbv_buyer` (`buyer_id`,`kind`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='采购方核验留痕：每次核验独立成行，可追溯证据与结论'",

  "CREATE TABLE IF NOT EXISTS `procurement_projects` (" +
    "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`reference` VARCHAR(40) NOT NULL COMMENT '采购需求编号 OSPR-{年}-{6位id}（创建即生成）', " +
    "`buyer_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_buyers.id', " +
    "`version_no` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已确认版本数（提交=确认版本+1；授权书/附件/核验均按版本绑定）', " +
    "`status` VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT '状态机：draft/submitted/need_info/under_review/published/closed', " +
    "`close_reason` VARCHAR(20) NULL COMMENT 'closed 细分：cancelled/withdrawn/expired', " +
    "`title_zh` VARCHAR(255) NOT NULL COMMENT '项目名称（中文）', " +
    "`title_en` VARCHAR(255) NULL COMMENT '项目名称（英文）', " +
    "`background` TEXT NULL COMMENT '采购目的/项目背景', " +
    "`purpose` VARCHAR(20) NOT NULL DEFAULT 'real' COMMENT '真实采购/预算阶段/市场调研/未来计划：real/budgeting/research/future_plan', " +
    "`internal_project_no` VARCHAR(120) NULL COMMENT '采购方内部项目编号', " +
    "`object_types` VARCHAR(120) NOT NULL DEFAULT 'goods' COMMENT '需求对象（逗号分隔）：goods/engineering/service/solution', " +
    "`budget_amount` DECIMAL(20,2) NULL COMMENT '预算金额（元）', " +
    "`budget_currency` VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种', " +
    "`budget_public` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '预算是否可向供应商公开', " +
    "`budget_approved` VARCHAR(20) NULL COMMENT '预算批准：approved/partial/pending/applying', " +
    "`delivery_country` VARCHAR(80) NULL COMMENT '交付国家', " +
    "`delivery_city` VARCHAR(120) NULL COMMENT '交付城市', " +
    "`delivery_province` VARCHAR(120) NULL COMMENT '交付省份（供应商省份匹配用）', " +
    "`delivery_address` VARCHAR(500) NULL COMMENT '交付地点', " +
    "`deadline_date` DATE NULL COMMENT '最晚交货/完成日期', " +
    "`install_needs` VARCHAR(200) NULL COMMENT '交付服务（逗号）：installation/commissioning/training', " +
    "`logistics_note` TEXT NULL COMMENT '运输/包装/清关特殊要求', " +
    "`incoterm` VARCHAR(20) NULL COMMENT '贸易术语（EXW/FOB/CIF/DDP 等）', " +
    "`payment_terms` VARCHAR(500) NULL COMMENT '付款方式与节点', " +
    "`guarantees` VARCHAR(120) NULL COMMENT '保函要求（逗号）：bid_bond/performance_bond/warranty_deposit', " +
    "`supplier_country_limit` VARCHAR(500) NULL COMMENT '限定供应商国家/地区（逗号，空=不限）', " +
    "`manufacturer_only` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求制造商直接参与', " +
    "`supplier_quals` TEXT NULL COMMENT '出口资质/行业认证/业绩要求', " +
    "`quote_deadline_at` INT UNSIGNED NULL COMMENT '最晚收报价/投标文件时间（秒）', " +
    "`supplier_confirm_date` DATE NULL COMMENT '预计确定供应商日期', " +
    "`contract_date` DATE NULL COMMENT '预计签约日期', " +
    "`compliance` JSON NULL COMMENT '合规信息（出口管制/危险品/医疗/军民两用/其他+说明）', " +
    "`authorize_publish` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '授权确认：允许云境OS发布给符合条件供应商', " +
    "`contact_disclosure` VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT '分级授权：none/org_only/org_contact/budget_all', " +
    "`procurement_mode` VARCHAR(16) NOT NULL DEFAULT 'rfq' COMMENT '采购方式（P2 方式判定引擎留置，MVP 恒 rfq）', " +
    "`primary_ugt_code` VARCHAR(32) NULL COMMENT '主品类 UGT 树码（提交时取第一条明细，匹配/检索用）', " +
    "`requirement_verify` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '需求真实性核验态（展示快照）：pending/pass/need_info/reject', " +
    "`fund_verify` VARCHAR(16) NOT NULL DEFAULT 'unverified' COMMENT '资金核验态（展示快照）：unverified/verified', " +
    "`submitted_at` INT UNSIGNED NULL COMMENT '最近一次提交时间（秒）', " +
    "`published_at` INT UNSIGNED NULL COMMENT '发布时间（秒）', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "`updated_at` INT UNSIGNED NOT NULL COMMENT '更新时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_project_reference` (`reference`), " +
    "KEY `idx_proj_buyer` (`buyer_id`,`status`), " +
    "KEY `idx_proj_status` (`status`,`published_at`), " +
    "KEY `idx_proj_ugt` (`primary_ugt_code`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='采购需求主表（F02）：一条采购项目关联一个主体与实际采购目的'",

  "CREATE TABLE IF NOT EXISTS `procurement_lots` (" +
    "`id` INT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`lot_no` VARCHAR(20) NOT NULL COMMENT '标包号（项目内唯一，如 LOT-01）', " +
    "`title` VARCHAR(255) NOT NULL COMMENT '标包名称', " +
    "`scope_note` VARCHAR(500) NULL COMMENT '投标范围说明', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_lot_project_no` (`project_id`,`lot_no`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='标包：一项目可拆多标包（家具/电子白板分别采购）'",

  "CREATE TABLE IF NOT EXISTS `procurement_items` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`lot_id` INT UNSIGNED NULL COMMENT '标包（NULL=未分包）', " +
    "`line_no` INT UNSIGNED NOT NULL COMMENT '明细序号（项目内递增）', " +
    "`name_zh` VARCHAR(255) NOT NULL COMMENT '产品/服务名称（中文）', " +
    "`name_en` VARCHAR(255) NULL COMMENT '产品/服务名称（英文，AI 翻译）', " +
    "`spec` TEXT NULL COMMENT '规格/型号/尺寸/材料/功率/技术指标', " +
    "`quantity` DECIMAL(20,4) NOT NULL DEFAULT 0 COMMENT '采购数量', " +
    "`qty_unit` VARCHAR(30) NOT NULL DEFAULT '件' COMMENT '数量单位', " +
    "`qty_type` VARCHAR(12) NOT NULL DEFAULT 'fixed' COMMENT '确定数量/预估数量：fixed/estimated', " +
    "`ugt_code` VARCHAR(32) NULL COMMENT '品类 UGT 树码（commodity_backbone，L1-L3；UNSPSC 已退役）', " +
    "`attributes` JSON NULL COMMENT '关键属性（材料/技术/功能/用途）', " +
    "`alternatives_allowed` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否允许同等/替代产品', " +
    "`created_at` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "KEY `idx_pitem_project` (`project_id`,`lot_id`,`line_no`), " +
    "KEY `idx_pitem_ugt` (`ugt_code`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='采购明细（F03）：一项目多标包多明细，明细独立成行独立编码'",

  "CREATE TABLE IF NOT EXISTS `procurement_attachments` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`version_no` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '绑定的确认版本（0=草稿期；确认后附件随版本冻结）', " +
    "`kind` VARCHAR(20) NOT NULL DEFAULT 'requirement' COMMENT '类型：requirement/tech_doc/bom/drawing/sample/other', " +
    "`filename` VARCHAR(255) NOT NULL COMMENT '原始文件名', " +
    "`file_key` VARCHAR(255) NOT NULL COMMENT 'upload_files 字节入库文件名', " +
    "`file_hash` CHAR(64) NOT NULL COMMENT '文件哈希（sha256，版本校验依据）', " +
    "`size_bytes` INT UNSIGNED NOT NULL COMMENT '文件大小', " +
    "`uploaded_by` INT UNSIGNED NOT NULL COMMENT '上传账号', " +
    "`uploaded_at` INT UNSIGNED NOT NULL COMMENT '上传时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "KEY `idx_patt_project` (`project_id`,`version_no`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='需求附件（图纸/技术需求书/BOM/样品照片）：字节入库+哈希，随版本冻结'",

  "CREATE TABLE IF NOT EXISTS `procurement_revisions` (" +
    "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
    "`project_id` INT UNSIGNED NOT NULL COMMENT '关联 procurement_projects.id', " +
    "`version_no` INT UNSIGNED NOT NULL COMMENT '版本号（提交即确认，递增）', " +
    "`snapshot` JSON NOT NULL COMMENT '版本快照（审核依据：主表+明细+附件清单的冻结态）', " +
    "`content_hash` CHAR(64) NOT NULL COMMENT '快照内容哈希（sha256）', " +
    "`confirmed_by` INT UNSIGNED NOT NULL COMMENT '确认账号', " +
    "`confirmed_at` INT UNSIGNED NOT NULL COMMENT '确认时间（秒）', " +
    "PRIMARY KEY (`id`), " +
    "UNIQUE KEY `uq_rev_project_version` (`project_id`,`version_no`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci " +
    "COMMENT='版本快照：采购方确认最终版本（流程第3步），授权书/核验/发布均按版本绑定'",
];

export const migration: Migration = {
  version: 11,
  name: "procurement_core",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of TABLES) {
      await dbPool.query(ddl);
    }
  },
};
