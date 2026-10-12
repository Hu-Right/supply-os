-- crm_bid_opportunities 精简轮 · 删列/删索引前 DDL 快照（唯一回滚依据）
-- 口径来源：云生产库（本仓 .env = 127.0.0.1:3307 SSH 隧道 → crm；MySQL 自报 hostname=lavm-pn1wgls09p/port=3306，口径同 docs/adr/0012）
-- 快照时间：2026-10-12T07:23:00.733Z
-- 行数 13565 · 索引 22 个：
--     idx_bid_opp_audit_status       audit_status
--     idx_bid_opp_country            country
--     idx_bid_opp_create_time        create_time
--     idx_bid_opp_deadline_ts        deadline_ts
--     idx_bid_opp_platform           source_platform
--     idx_bid_opp_reference          reference
--     idx_bid_opp_status             status
--     idx_bid_opp_tenant_id          tenant_id
--     idx_create_user                create_user_id
--     idx_opp_ai_l5_lock             ai_l5_lock_token,ai_l5_lock_at
--     idx_opp_assign_id              assign_user_id,id
--     idx_opp_deadline_sec           deadline_sec
--     idx_opp_qualified_id           is_qualified,status,audit_status,id
--     idx_opp_source_covering        source_notice_id,is_qualified,status,audit_status
--     idx_opp_tenant_audit_id        tenant_id,audit_status,id
--     idx_opp_tenant_create          tenant_id,create_time
--     idx_opp_tenant_id              tenant_id,id
--     idx_opp_tenant_reference       tenant_id,reference
--     idx_review_deadline            review_status,deadline_sec
--     idx_review_status              review_status
--     idx_source_notice              source_notice_id
--     PRIMARY                        id
-- 复跑取证：node --env-file=.env scripts/tools/opp-slim-evidence.mjs
-- 执行精简：node --env-file=.env scripts/tools/opp-shadow-phase1.mjs --build（影子表，原表不动）
CREATE TABLE `crm_bid_opportunities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT '1',
  `create_user_id` bigint DEFAULT '0',
  `source_platform` varchar(50) DEFAULT 'ungm',
  `source_notice_id` varchar(100) DEFAULT NULL,
  `source_url` varchar(1024) DEFAULT NULL,
  `title` varchar(500) DEFAULT NULL,
  `reference` varchar(200) DEFAULT NULL,
  `notice_type` varchar(100) DEFAULT NULL,
  `registration_level` varchar(500) DEFAULT NULL,
  `agency` varchar(255) DEFAULT NULL,
  `agency_full` varchar(500) DEFAULT NULL,
  `country` varchar(200) DEFAULT NULL,
  `beneficiary_countries` varchar(500) DEFAULT NULL,
  `published_date` varchar(50) DEFAULT NULL,
  `deadline` varchar(100) DEFAULT NULL,
  `deadline_ts` bigint DEFAULT NULL,
  `deadline_timezone` varchar(200) DEFAULT NULL,
  `incoterms` varchar(500) DEFAULT NULL,
  `estimated_value` varchar(200) DEFAULT NULL,
  `description` longtext,
  `bid_overview` text,
  `supplier_conditions` text,
  `eligibility` text,
  `technical_hurdles` text,
  `training_link` text,
  `industry` varchar(100) DEFAULT NULL,
  `unspsc_codes` json DEFAULT NULL,
  `thresholds` json DEFAULT NULL,
  `difficulty` varchar(50) DEFAULT NULL,
  `contacts` json DEFAULT NULL,
  `documents` json DEFAULT NULL,
  `external_links` json DEFAULT NULL,
  `ai_analyzed_at` bigint DEFAULT NULL,
  `ai_products` json DEFAULT NULL,
  `ai_analysis` json DEFAULT NULL,
  `status` tinyint DEFAULT '0',
  `priority` tinyint DEFAULT '0',
  `assign_user_id` bigint DEFAULT NULL,
  `assign_time` datetime DEFAULT NULL,
  `assignment_rule_id` int unsigned NOT NULL DEFAULT '0',
  `remark` text,
  `extra` json DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `audit_status` tinyint DEFAULT '0',
  `review_status` varchar(32) NOT NULL DEFAULT 'submitted' COMMENT '流程状态：draft/submitted/rejected_editing/resubmitted/approved',
  `last_submit_time` datetime DEFAULT NULL,
  `last_submit_user_id` bigint DEFAULT NULL,
  `last_edit_user_id` bigint DEFAULT NULL,
  `last_edit_time` datetime DEFAULT NULL,
  `audit_admin_id` bigint DEFAULT NULL,
  `audit_time` datetime DEFAULT NULL,
  `is_qualified` tinyint DEFAULT '0',
  `product_code` varchar(128) DEFAULT NULL,
  `description_cn` text,
  `description_other` text,
  `ai_l5_lock_token` varchar(80) NOT NULL DEFAULT '',
  `ai_l5_lock_at` datetime DEFAULT NULL,
  `is_expired` tinyint DEFAULT '0' COMMENT '是否过期',
  `deadline_sec` int unsigned GENERATED ALWAYS AS (if((`deadline_ts` > 100000000000),floor((`deadline_ts` / 1000)),`deadline_ts`)) STORED,
  `deadline_parsed` datetime DEFAULT NULL,
  `procurement_procedure` varchar(60) DEFAULT NULL COMMENT '采购程序：AOI一步法/两阶段/有预审等',
  `prequalification_required` tinyint(1) DEFAULT NULL COMMENT '是否需事先资格预审：1是0否，NULL未说明',
  `lot_structure` varchar(255) DEFAULT NULL COMMENT '标段结构：单一不可分割/N标段，是否接受部分投标',
  `contract_form` varchar(60) DEFAULT NULL COMMENT '合同形式：EPC交钥匙/单价/总价/框架协议',
  `consortium_rule` varchar(500) DEFAULT NULL COMMENT '联合体规则：是否允许、强制成员、责任形式',
  `bid_validity_days` smallint unsigned DEFAULT NULL COMMENT '投标有效期（天）',
  `submission_mode` varchar(30) DEFAULT NULL COMMENT '递交方式：paper纸质/electronic电子/both',
  `submission_requirement` varchar(500) DEFAULT NULL COMMENT '封装与份数要求：正本/副本/USB、信封规则',
  `submission_address` varchar(500) DEFAULT NULL COMMENT '递交送达地址与递交通道',
  `funding_agency` varchar(300) DEFAULT NULL COMMENT '资金融出方与融资额度（非合同估算价）',
  `evaluation_method` varchar(500) DEFAULT NULL COMMENT '评标方法与成本模型口径',
  `language_requirement` varchar(300) DEFAULT NULL COMMENT '投标文件语言与译文认证要求',
  `execution_period` varchar(100) DEFAULT NULL COMMENT '合同工期原文（如 48 个月）',
  `local_content` varchar(300) DEFAULT NULL COMMENT '本地成分与本地执行要求',
  `eshs_requirements` text COMMENT '环境与社会及健康安全（ESHS）要求',
  `eligible_countries` varchar(300) DEFAULT NULL COMMENT '合格投标人国别范围',
  `key_dates` text COMMENT '关键节点 JSON：发布/准备会/踏勘/澄清截止/递交截止/开标',
  PRIMARY KEY (`id`),
  KEY `idx_source_notice` (`source_notice_id`),
  KEY `idx_create_user` (`create_user_id`),
  KEY `idx_review_status` (`review_status`),
  KEY `idx_opp_qualified_id` (`is_qualified`,`status`,`audit_status`,`id`),
  KEY `idx_opp_source_covering` (`source_notice_id`,`is_qualified`,`status`,`audit_status`),
  KEY `idx_opp_deadline_sec` (`deadline_sec`),
  KEY `idx_opp_tenant_reference` (`tenant_id`,`reference`),
  KEY `idx_opp_tenant_id` (`tenant_id`,`id`),
  KEY `idx_opp_tenant_audit_id` (`tenant_id`,`audit_status`,`id`),
  KEY `idx_opp_tenant_create` (`tenant_id`,`create_time`),
  KEY `idx_opp_assign_id` (`assign_user_id`,`id`),
  KEY `idx_opp_ai_l5_lock` (`ai_l5_lock_token`,`ai_l5_lock_at`),
  KEY `idx_bid_opp_tenant_id` (`tenant_id`),
  KEY `idx_bid_opp_reference` (`reference`),
  KEY `idx_bid_opp_platform` (`source_platform`),
  KEY `idx_bid_opp_status` (`status`),
  KEY `idx_bid_opp_audit_status` (`audit_status`),
  KEY `idx_bid_opp_deadline_ts` (`deadline_ts`),
  KEY `idx_bid_opp_create_time` (`create_time`),
  KEY `idx_bid_opp_country` (`country`),
  KEY `idx_review_deadline` (`review_status`,`deadline_sec`)
) ENGINE=InnoDB AUTO_INCREMENT=19957 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机表（人工拆单）';
