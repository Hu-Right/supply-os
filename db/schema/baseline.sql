-- db/schema/baseline.sql —— 全库结构基线（E2E 建表唯一来源，CI e2e job 按文件名序导入）
--
-- 生成方式：node --env-file=.env scripts/tools/dump-schema-baseline.mjs
-- 生成口径：仅 BASE TABLE，按表名升序，排除影子/备份表，剔除 AUTO_INCREMENT 计数。
--           源库共 114 张，导出 110 张，排除 4 张。
-- 目标内核：MySQL 8.0 / utf8mb4（服务端默认 collation utf8mb4_0900_ai_ci，
--   innodb_ft_min_token_size=3、ngram_token_size=2 均为 8.0 出厂值，无需额外启动参数）。
-- 注意：本文件只建结构、不含数据；业务数据的事实源是数据库本身，不入仓、不在代码里造。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── chat_agent_presence ──
CREATE TABLE `chat_agent_presence` (
  `agent_uid` int unsigned NOT NULL,
  `agent_email` varchar(190) NOT NULL DEFAULT '',
  `dept` varchar(50) NOT NULL DEFAULT 'sales',
  `status` enum('online','busy','away','offline') NOT NULL DEFAULT 'offline',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客服在线状态（P1 自动分配）';

-- ── chat_canned_replies ──
CREATE TABLE `chat_canned_replies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_uid` int unsigned DEFAULT NULL,
  `owner_email` varchar(190) DEFAULT NULL,
  `title` varchar(100) NOT NULL DEFAULT '',
  `content` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_canned_owner` (`owner_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客服快捷回复/常用语（P1）';

-- ── cmd_accounts ──
CREATE TABLE `cmd_accounts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '登录名',
  `password_hash` varchar(200) NOT NULL,
  `display_name` varchar(100) NOT NULL COMMENT '显示姓名',
  `employee_id` int unsigned DEFAULT NULL COMMENT '关联 employees.id',
  `dept_code` varchar(20) DEFAULT NULL COMMENT '管理部门（非员工账号使用；员工账号实时取 employees.dept_code）',
  `role_id` int unsigned DEFAULT NULL COMMENT '指定角色（覆盖部门默认角色）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `employee_id` (`employee_id`),
  CONSTRAINT `fk_cmd_account_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OS后台用户表';

-- ── agency_aliases ──
CREATE TABLE `agency_aliases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `canonical` varchar(255) NOT NULL COMMENT '标准机构名（展示用）',
  `alias` varchar(255) NOT NULL COMMENT '别名（匹配用，大写存储）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name_i18n` json DEFAULT NULL,
  `normalized_alias` varchar(255) GENERATED ALWAYS AS (upper(trim(`alias`))) STORED,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `source_ref` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_normalized_alias` (`normalized_alias`),
  KEY `idx_canonical` (`canonical`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机构归一化';

-- ── agency_types ──
-- 机构类型字典：类型键、生效国家、多语言名。country_code=NULL 表示全球通用。
CREATE TABLE `agency_types` (
  `type_key` varchar(100) NOT NULL,
  `country_code` char(2) DEFAULT NULL COMMENT 'NULL=全球；BR/KE=国家特定',
  `name_i18n` json DEFAULT NULL COMMENT '类型多语言名称',
  `priority` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`type_key`),
  KEY `idx_agency_types_country` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机构类型字典';

-- ── agency_type_rules ──
-- 机构名 → 类型规则的唯一数据源；country_code 必须与规则匹配的国家一致。
CREATE TABLE `agency_type_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `type_key` varchar(100) NOT NULL,
  `country_code` char(2) DEFAULT NULL COMMENT 'NULL=全球；非 NULL 时只在对应国家生效',
  `pattern` varchar(1000) NOT NULL COMMENT 'JS 正则 source',
  `flags` varchar(10) NOT NULL DEFAULT 'i',
  `priority` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_rules_type` (`type_key`),
  KEY `idx_rules_country_priority` (`country_code`,`priority`),
  CONSTRAINT `fk_agency_rule_type` FOREIGN KEY (`type_key`) REFERENCES `agency_types` (`type_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机构类型匹配规则';

-- ── agency_type_assignments ──
-- 精确机构分类覆盖：用于规则无法稳定判断的高频机构；优先级高于 pattern rules。
CREATE TABLE `agency_type_assignments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `canonical` varchar(255) NOT NULL COMMENT '机构规范名（统一大写匹配）',
  `country_code` char(2) DEFAULT NULL,
  `type_key` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assignment_canonical` (`canonical`),
  KEY `idx_assignment_type` (`type_key`),
  CONSTRAINT `fk_agency_assignment_type` FOREIGN KEY (`type_key`) REFERENCES `agency_types` (`type_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机构类型精确覆盖';

-- ── api_keys ──
CREATE TABLE `api_keys` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key_hash` char(64) NOT NULL COMMENT 'API Key SHA-256 哈希（不存明文）',
  `key_prefix` varchar(16) NOT NULL COMMENT 'Key 前缀，供调用方识别',
  `name` varchar(100) NOT NULL COMMENT '应用名称',
  `tier` enum('basic','pro') NOT NULL DEFAULT 'basic' COMMENT '套餐档位',
  `rate_limit_per_min` int NOT NULL DEFAULT '60' COMMENT '每分钟请求上限',
  `daily_quota` int NOT NULL DEFAULT '1000' COMMENT '每日调用配额',
  `status` enum('active','suspended','revoked') NOT NULL DEFAULT 'active',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间（NULL=永不过期）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_key_hash` (`key_hash`),
  KEY `idx_status` (`status`),
  KEY `idx_prefix` (`key_prefix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部API KEY';

-- ── api_usage ──
CREATE TABLE `api_usage` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `api_key_id` bigint unsigned NOT NULL,
  `endpoint` varchar(80) NOT NULL COMMENT '调用端点',
  `tier` enum('basic','pro') NOT NULL DEFAULT 'basic' COMMENT '消耗档位',
  `response_code` smallint NOT NULL DEFAULT '200' COMMENT 'HTTP 响应码',
  `ip_address` varchar(45) DEFAULT NULL COMMENT '调用方 IP',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_key_date` (`api_key_id`,`created_at`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部API获取的信息。';

-- ── appointments ──
CREATE TABLE `appointments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `employee_id` int unsigned DEFAULT NULL,
  `employee_name` varchar(100) DEFAULT NULL,
  `appointment_time` datetime DEFAULT NULL,
  `topic` varchar(300) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `remark` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── benefit_catalog ──
CREATE TABLE `benefit_catalog` (
  `benefit_code` varchar(64) NOT NULL COMMENT '权益稳定机器码，上线后不可改语义（如 notice_view）',
  `name_zh` varchar(120) NOT NULL COMMENT '权益中文名，官网矩阵行名与卡片 chip 文案唯一来源',
  `value_kind` enum('bool','enum','quota') NOT NULL COMMENT '取值类型，决定 plan_benefits 哪个值列有值：bool/enum→value_level，quota→value_num',
  `level_dict` json DEFAULT NULL COMMENT '枚举行各层级业务含义（值=价格文档单元格原文），非枚举行恒为 NULL',
  `sort_order` int NOT NULL COMMENT '矩阵行全局唯一展示顺序；官网行序与价格体系文档 02 章一致',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`benefit_code`),
  UNIQUE KEY `uk_benefit_sort` (`sort_order`),
  CONSTRAINT `chk_enum_dict_v2` CHECK (((`value_kind` <> _utf8mb4'enum') or (`level_dict` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权益目录表。';

-- ── benefit_quotas ──
CREATE TABLE `benefit_quotas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `subscription_id` bigint unsigned DEFAULT NULL COMMENT 'FK plan_subscriptions：额度随订阅生灭；NULL=普通用户池（免费档计量权益）',
  `subscription_pool_key` bigint GENERATED ALWAYS AS (ifnull(`subscription_id`,0)) STORED COMMENT '生成列：把普通用户池的 NULL 归一为 0，使其可参与唯一约束',
  `user_id` bigint unsigned NOT NULL COMMENT '额度持有用户：订阅池记主账号，普通用户池记本人',
  `benefit_code` varchar(64) NOT NULL COMMENT 'FK benefit_catalog：本池计量哪种权益（计量型判据唯一为 value_kind=quota）',
  `quota_total` int NOT NULL COMMENT '总额度；-1=不限（不限行不记消耗）',
  `quota_used` int NOT NULL DEFAULT '0' COMMENT '已用量；quota_total=-1 时恒为 0',
  `period_starts_at` datetime NOT NULL COMMENT '池的发放代次起点=幂等锚点：订阅池取该订阅 started_at、普通用户池取 1970-01-01 终身哨兵；故意不给默认值——本列参与 uk_pool，写行级时间戳会让同池重发另开一行满额池',
  `status` enum('active','exhausted','frozen') NOT NULL DEFAULT 'active' COMMENT '仅 active 可扣减；扣满置 exhausted、退款/升级承接置 frozen；订阅过期由 plan_subscriptions 表达，本表不设 expired',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pool` (`subscription_pool_key`,`user_id`,`benefit_code`,`period_starts_at`),
  KEY `idx_subscription` (`subscription_id`,`status`),
  KEY `fk_quota_benefit` (`benefit_code`),
  CONSTRAINT `fk_quota_benefit` FOREIGN KEY (`benefit_code`) REFERENCES `benefit_catalog` (`benefit_code`),
  CONSTRAINT `fk_quota_sub` FOREIGN KEY (`subscription_id`) REFERENCES `plan_subscriptions` (`id`),
  CONSTRAINT `chk_usage` CHECK ((`quota_used` between 0 and greatest(`quota_total`,0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权益额度账本表。';

-- ── bid_award_winners ──
CREATE TABLE `bid_award_winners` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `award_id` bigint unsigned NOT NULL COMMENT '关联 bid_awards.id',
  `winner_name` varchar(500) NOT NULL DEFAULT '' COMMENT '中标商名称（英文/原文）',
  `winner_name_cn` varchar(500) DEFAULT NULL COMMENT '中标商名称（中文）',
  `winner_country` varchar(100) DEFAULT NULL COMMENT '中标商所在国家',
  `winner_type` varchar(50) DEFAULT NULL COMMENT '中标商类型: supplier, consortium, ngo, government 等',
  `registration_level` varchar(20) DEFAULT NULL COMMENT 'UNGM 注册等级（L1/L2）',
  `certifications` json DEFAULT NULL COMMENT '资质证书列表（JSON 数组）',
  `share_amount` decimal(18,2) DEFAULT NULL COMMENT '该中标商分摊金额',
  `share_currency` varchar(10) DEFAULT NULL COMMENT '分摊金额币种',
  `contact_email` varchar(200) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `website` varchar(500) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_id` (`award_id`),
  KEY `idx_winner_name` (`winner_name`(191)),
  KEY `idx_winner_country` (`winner_country`),
  CONSTRAINT `fk_award_winners_award` FOREIGN KEY (`award_id`) REFERENCES `bid_awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='中标商信息表';

-- ── bid_awards ──
CREATE TABLE `bid_awards` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_platform` varchar(30) NOT NULL DEFAULT 'unicef' COMMENT '数据来源平台: unicef, ungm, who, undp, cn_gov, dgmarket 等',
  `source_url` varchar(2000) DEFAULT NULL COMMENT '原始页面/PDF 链接',
  `external_id` varchar(200) DEFAULT NULL COMMENT '来源平台的外部唯一标识（如 UNGM award ID）',
  `title` varchar(1000) NOT NULL DEFAULT '' COMMENT '中标项目名称',
  `title_cn` varchar(1000) DEFAULT NULL COMMENT '中标项目名称（中文）',
  `reference` varchar(200) DEFAULT NULL COMMENT '招标编号 / 合同编号',
  `contract_no` varchar(200) DEFAULT NULL COMMENT '合同编号',
  `agency` varchar(200) DEFAULT NULL COMMENT '采购机构简称（如 UNICEF）',
  `agency_full` varchar(500) DEFAULT NULL COMMENT '采购机构全称',
  `country` varchar(100) DEFAULT NULL COMMENT '采购国家/地区',
  `award_date` date DEFAULT NULL COMMENT '中标公示日期',
  `contract_value` decimal(18,2) DEFAULT NULL COMMENT '合同金额（原始币种）',
  `contract_value_usd` decimal(18,2) DEFAULT NULL COMMENT '合同金额（美元换算）',
  `currency` varchar(10) DEFAULT 'USD' COMMENT '币种',
  `description` text COMMENT '中标项目描述（原文）',
  `description_cn` text COMMENT '中标项目描述（中文）',
  `category` varchar(300) DEFAULT NULL COMMENT '采购品类名称',
  `industry` varchar(100) DEFAULT NULL COMMENT '行业分类',
  `source_notice_id` varchar(100) DEFAULT NULL COMMENT '关联的 bid_notices.notice_id（如可匹配）',
  `raw_data` json DEFAULT NULL COMMENT '爬虫原始数据（JSON），便于回溯与重新解析',
  `crawl_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '爬取时间',
  `create_time` int unsigned DEFAULT NULL COMMENT 'Unix 时间戳（兼容 daily-sync 水位线）',
  `update_time` int unsigned DEFAULT NULL COMMENT 'Unix 时间戳（兼容 daily-sync 水位线）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_external` (`source_platform`,`external_id`),
  KEY `idx_award_date` (`award_date`),
  KEY `idx_agency` (`agency`),
  KEY `idx_country` (`country`),
  KEY `idx_reference` (`reference`),
  KEY `idx_source_notice` (`source_notice_id`),
  KEY `idx_update_time` (`update_time`),
  KEY `idx_crawl_time` (`crawl_time`),
  KEY `idx_source_platform` (`source_platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='已中标数据';

-- ── bid_notices ──
CREATE TABLE `bid_notices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `notice_id` varchar(100) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL COMMENT 'reference no',
  `title` varchar(500) DEFAULT NULL,
  `notice_type` varchar(500) DEFAULT NULL,
  `agency` varchar(255) DEFAULT NULL,
  `country` varchar(500) DEFAULT NULL,
  `deadline` varchar(50) DEFAULT NULL,
  `deadline_ts` bigint DEFAULT NULL,
  `url` varchar(512) DEFAULT NULL,
  `description` longtext,
  `contacts` json DEFAULT NULL,
  `external_links` json DEFAULT NULL,
  `procurement_files` json DEFAULT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `is_expired` bigint DEFAULT NULL,
  `converted_opp_id` bigint DEFAULT NULL,
  `create_time` bigint DEFAULT NULL,
  `update_time` bigint DEFAULT NULL,
  `documents` json DEFAULT NULL COMMENT 'UNGM内部文档链接',
  `difficulty` varchar(50) DEFAULT NULL COMMENT '门槛评级：简单/中等/较高/严格',
  `registration_level` varchar(100) DEFAULT NULL,
  `agency_full` varchar(500) DEFAULT NULL,
  `estimated_value` varchar(200) DEFAULT NULL COMMENT '预算/金额提取',
  `currency` varchar(10) DEFAULT 'CNY' COMMENT 'RFQ预算币种',
  `published_date` varchar(50) DEFAULT NULL COMMENT '发布日期',
  `rfq_status` varchar(20) DEFAULT NULL COMMENT 'RFQ状态: draft, published, closed',
  `rfq_reject_reason` varchar(500) DEFAULT NULL COMMENT 'RFQ审核驳回原因（后台填写）',
  `beneficiary_countries` varchar(500) DEFAULT NULL COMMENT '受益国家',
  `organization` varchar(500) DEFAULT NULL,
  `key_contacts` varchar(255) DEFAULT NULL,
  `deadline_sec` bigint GENERATED ALWAYS AS (if((`deadline_ts` > 100000000000),floor((`deadline_ts` / 1000)),`deadline_ts`)) STORED,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `budget_confidential` tinyint(1) DEFAULT '0' COMMENT '预算是否保密（1=前端显示"预算保密"）',
  `delivery_address` varchar(255) DEFAULT NULL COMMENT '详细交付地址',
  `incoterm` varchar(16) DEFAULT NULL COMMENT '贸易术语: EXW/FOB/CIF/DDP 等',
  `delivery_time` varchar(64) DEFAULT NULL COMMENT '交付时间要求',
  `payment_terms` varchar(255) DEFAULT NULL COMMENT '付款方式',
  `supplier_reqs` varchar(500) DEFAULT NULL COMMENT 'RFQ供应商资质要求',
  `visibility` varchar(16) DEFAULT 'public' COMMENT '可见性: public=公开, targeted=定向',
  `contact_name` varchar(64) DEFAULT NULL COMMENT '联系人姓名',
  `contact_email` varchar(128) DEFAULT NULL COMMENT '联系邮箱',
  `contact_phone` varchar(32) DEFAULT NULL COMMENT '联系电话',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '创建者用户ID（平台发布）',
  `entry_source` varchar(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源: crawl, platform, api',
  `province_name` varchar(50) DEFAULT NULL COMMENT '交付省份（RFQ国内用）',
  `category_code` varchar(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'RFQ 品目分类（UGT 最深节点码；旧字典退役后的承接位，category_l1_id/l2_id 停写）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_source` (`notice_id`),
  KEY `idx_agency` (`agency`),
  KEY `idx_notice_type` (`notice_type`),
  KEY `idx_deadline_sec` (`deadline_sec`),
  KEY `idx_bid_notices_featured` (`is_featured`),
  KEY `idx_bid_notices_country` (`country`),
  KEY `idx_notices_filter` (`country`(100),`agency`(100),`notice_type`(50)),
  KEY `idx_notices_reference` (`reference`(200),`is_active`),
  KEY `idx_entry_source` (`entry_source`,`notice_type`),
  KEY `idx_bid_notices_user_id` (`user_id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_bid_notices_converted_opp` (`converted_opp_id`),
  FULLTEXT KEY `ft_notices_search` (`title`,`reference`,`description`) /*!50100 WITH PARSER `ngram` */ ,
  FULLTEXT KEY `ft_notices_en` (`title`,`reference`),
  FULLTEXT KEY `ft_notices_desc` (`description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='招标公告表。';

-- ── bid_opportunities ──
CREATE TABLE `bid_opportunities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
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
  `contacts` json DEFAULT NULL,
  `documents` json DEFAULT NULL,
  `external_links` json DEFAULT NULL,
  `ai_products` json DEFAULT NULL,
  `ai_analysis` json DEFAULT NULL,
  `status` tinyint DEFAULT '0',
  `priority` tinyint DEFAULT '0',
  `remark` text,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `audit_status` tinyint DEFAULT '0',
  `review_status` varchar(32) NOT NULL DEFAULT 'submitted' COMMENT '流程状态：draft/submitted/rejected_editing/resubmitted/approved',
  `is_qualified` tinyint DEFAULT '0',
  `description_cn` text,
  `description_other` text,
  `deadline_sec` int unsigned GENERATED ALWAYS AS (if((`deadline_ts` > 100000000000),floor((`deadline_ts` / 1000)),`deadline_ts`)) STORED,
  PRIMARY KEY (`id`),
  KEY `idx_opp_qualified_id` (`is_qualified`,`status`,`audit_status`,`id`),
  KEY `idx_opp_source_covering` (`source_notice_id`,`is_qualified`,`status`,`audit_status`),
  KEY `idx_opp_deadline_sec` (`deadline_sec`),
  KEY `idx_bid_opp_reference` (`reference`),
  KEY `idx_bid_opp_platform` (`source_platform`),
  KEY `idx_bid_opp_status` (`status`),
  KEY `idx_bid_opp_audit_status` (`audit_status`),
  KEY `idx_bid_opp_deadline_ts` (`deadline_ts`),
  KEY `idx_bid_opp_create_time` (`create_time`),
  KEY `idx_bid_opp_country` (`country`),
  KEY `idx_review_deadline` (`review_status`,`deadline_sec`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机表（人工拆单）';

-- ── channel_codes ──
CREATE TABLE `channel_codes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '邀请码，CH- 前缀，与员工 EMP- 不撞',
  `partner_id` int unsigned NOT NULL COMMENT '归属主体，码必须生在主体名下（无悬空码）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0=停码，注册校验即拒',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL COMMENT '发放人 cmd_accounts.id，追责用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_code` (`code`),
  KEY `idx_channel_code_partner` (`partner_id`),
  CONSTRAINT `fk_channel_code_partner` FOREIGN KEY (`partner_id`) REFERENCES `channel_partners` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── channel_partners ──
CREATE TABLE `channel_partners` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '渠道商主体名称（唯一，防同名裂行致分佣分裂）',
  `contact` varchar(100) DEFAULT NULL COMMENT '联系人/手机/微信，自由文本一列',
  `remark` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0=停用，名下一切码门户即时拒，且不可再发新码',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_partner_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── channel_registrations ──
CREATE TABLE `channel_registrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT 'users.id；一人一行=幂等锚点',
  `code` varchar(32) NOT NULL COMMENT '注册当时填的码（冗余留痕，码停用后仍可追溯）',
  `partner_id` int unsigned NOT NULL COMMENT '写账瞬间从码上抄下的主体快照',
  `user_type` enum('personal','enterprise') NOT NULL DEFAULT 'personal' COMMENT '与 users.user_type 同语义；认证转企业时翻转',
  `registered_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_reg_user` (`user_id`),
  KEY `idx_channel_reg_partner` (`partner_id`,`registered_at`),
  KEY `idx_channel_reg_code` (`code`,`registered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── chat_messages ──
CREATE TABLE `chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint unsigned NOT NULL COMMENT '所属会话 ID',
  `role` enum('customer','ai','agent') NOT NULL COMMENT '消息角色: customer=客户, ai=AI助手, agent=运营经理',
  `content` text NOT NULL COMMENT '消息正文',
  `metadata` json DEFAULT NULL COMMENT '扩展元数据（AI 意图、置信度等）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_session_created` (`session_id`,`created_at`),
  KEY `idx_role` (`role`),
  CONSTRAINT `fk_chat_msg_session` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── chat_sessions ──
CREATE TABLE `chat_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `customer_id` varchar(64) NOT NULL COMMENT '客户标识（用户 ID 或匿名 session）',
  `customer_name` varchar(128) DEFAULT NULL COMMENT '客户名称',
  `lead_id` varchar(64) DEFAULT NULL COMMENT '关联的 Lead ID（如有）',
  `agent_id` varchar(64) DEFAULT NULL COMMENT '接管的运营经理用户 ID',
  `agent_email` varchar(255) DEFAULT NULL COMMENT '运营经理邮箱',
  `assigned_uid` int unsigned DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `status` enum('waiting','active','closed') NOT NULL DEFAULT 'waiting' COMMENT '会话状态: waiting=等待接入, active=已接入, closed=已关闭',
  `mode` enum('ai','human','hybrid') NOT NULL DEFAULT 'ai' COMMENT '当前模式: ai=AI自动, human=人工, hybrid=混合',
  `ai_handled_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'AI 自动回复次数',
  `locale` varchar(8) NOT NULL DEFAULT 'en' COMMENT '客户语言偏好',
  `ai_summary` text COMMENT 'AI 生成的对话摘要（转人工时传递上下文）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` datetime DEFAULT NULL COMMENT '人工接入时间',
  `closed_at` datetime DEFAULT NULL COMMENT '会话关闭时间',
  `last_message_at` datetime DEFAULT NULL COMMENT '最后消息时间',
  `satisfaction` tinyint unsigned DEFAULT NULL COMMENT '1-5 星',
  `satisfaction_tag` varchar(190) DEFAULT NULL,
  `satisfaction_comment` varchar(500) DEFAULT NULL,
  `rated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_agent_id` (`agent_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_assigned_uid` (`assigned_uid`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status_created` (`status`,`created_at`),
  KEY `idx_status_assigned` (`status`,`assigned_at`),
  KEY `idx_status_agent` (`status`,`agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── commodity_backbone ──
CREATE TABLE `commodity_backbone` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL COMMENT '树码 UGT-B-<2/4/6/8/10位>，码长即层级：1大类 2中类 3小类 4子类 5品目',
  `parent_code` varchar(16) NOT NULL DEFAULT '' COMMENT '父节点码；大类行为空串（大类之上不再有层）',
  `level` tinyint NOT NULL COMMENT '层级 1~5，必须与 code 去前缀后的长度一致（门禁 BB1 卡）',
  `name_zh` varchar(300) NOT NULL COMMENT '中文名；与 crm_commodity_nodes.name_zh 同宽（实测类名有超 100 字的）',
  `name_en` varchar(300) NOT NULL DEFAULT '' COMMENT '英文名；界面文案走 locale，本列供运维对账与缺中文时兜底',
  `sort` int NOT NULL COMMENT '同父内稳定顺序，按公告量降序固化，不随每日量漂移',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用（停用不删行，保留历史归属）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_parent` (`parent_code`),
  KEY `idx_level` (`level`),
  FULLTEXT KEY `ft_backbone_names` (`name_zh`,`name_en`) /*!50100 WITH PARSER `ngram` */ 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='五级品目树。';

-- ── consent_log ──
CREATE TABLE `consent_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '流水主键（无业务语义，仅定位单条留痕）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '同意人 ID（users.id）；已删用户/匿名化留痕行保持 NULL，属预期非孤儿',
  `consent_type` varchar(32) NOT NULL COMMENT '同意事项：terms=用户条款 / privacy=隐私政策 / marketing=营销 / cookie=Cookie / llm_outbound_data=AI 数据出站授权',
  `document_version` varchar(20) NOT NULL COMMENT '被同意的协议版本号（合规举证核心：证明他同意的是当时那一版）',
  `action` varchar(16) NOT NULL COMMENT '本次动作：agree=同意 / withdraw=撤回 / re-agree=重新同意；append-only，当前生效态取该 (user_id, consent_type) 最新一行',
  `ip_address` varchar(45) DEFAULT NULL COMMENT '同意时客户端 IP（取自 x-forwarded-for 首段，属可伪造的弱证据，保留期为合规策略项）',
  `user_agent` varchar(512) DEFAULT NULL COMMENT '同意时浏览器/设备标识（同为弱证据，辅助还原同意场景）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '落库时间 = 服务端记录到的同意时间（本表唯一时间事实源）',
  PRIMARY KEY (`id`),
  KEY `idx_consent_type` (`consent_type`),
  KEY `idx_consent_log_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='协议同意审计日志。';

-- ── country_aliases ──
CREATE TABLE `country_aliases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `canonical` varchar(100) NOT NULL COMMENT '国家标准英文名（归一锚点）',
  `country_code` char(2) DEFAULT NULL COMMENT 'ISO 3166-1 alpha-2，对齐 supplier.country_code / 国旗；region/invalid 为 NULL',
  `alias` varchar(255) NOT NULL COMMENT '别名/变体（匹配键）',
  `normalized_alias` varchar(255) GENERATED ALWAYS AS (upper(trim(`alias`))) STORED,
  `kind` enum('country','region','invalid') NOT NULL DEFAULT 'country' COMMENT 'country=真国家(可下拉) / region=区域聚合(排除) / invalid=非国家脏值(排除)',
  `name_i18n` json DEFAULT NULL COMMENT '多语言展示名{zh,en}',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `source_ref` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_normalized_alias` (`normalized_alias`),
  KEY `idx_canonical` (`canonical`),
  KEY `idx_code` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='国家归一化';

-- ── email_accounts ──
CREATE TABLE `email_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_name` varchar(100) NOT NULL COMMENT '账号别名',
  `provider` varchar(30) NOT NULL DEFAULT 'custom' COMMENT 'sendgrid/mailgun/ses/aliyun/tencent/custom',
  `smtp_host` varchar(200) NOT NULL DEFAULT '' COMMENT 'SMTP主机',
  `smtp_port` smallint NOT NULL DEFAULT '587' COMMENT 'SMTP端口',
  `smtp_encryption` varchar(10) NOT NULL DEFAULT 'tls' COMMENT 'tls/ssl/none',
  `smtp_user` varchar(200) NOT NULL DEFAULT '' COMMENT 'SMTP用户名/API Key',
  `smtp_pass` varchar(500) NOT NULL DEFAULT '' COMMENT 'SMTP密码(AES加密)',
  `smtp_proxy` varchar(100) DEFAULT NULL COMMENT 'SOCKS5代理 格式: 127.0.0.1:7890，留空不使用代理',
  `sender_name` varchar(100) NOT NULL DEFAULT '' COMMENT '发件人显示名',
  `sender_email` varchar(200) NOT NULL DEFAULT '' COMMENT '发件人邮箱',
  `reply_to` varchar(200) DEFAULT NULL COMMENT '回复地址',
  `imap_host` varchar(200) NOT NULL DEFAULT '' COMMENT 'IMAP主机',
  `imap_port` smallint NOT NULL DEFAULT '993' COMMENT 'IMAP端口',
  `imap_encryption` varchar(10) NOT NULL DEFAULT 'ssl' COMMENT 'ssl/tls/none',
  `imap_folder` varchar(100) NOT NULL DEFAULT 'INBOX' COMMENT '监听收件箱',
  `sync_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否开启收件同步',
  `last_sync_at` int DEFAULT NULL COMMENT '最后同步时间',
  `last_sync_uid` int DEFAULT '0' COMMENT '最后同步的IMAP UID',
  `daily_limit` int NOT NULL DEFAULT '500' COMMENT '每日上限',
  `today_sent` int NOT NULL DEFAULT '0' COMMENT '今日已发',
  `last_reset_date` date DEFAULT NULL COMMENT '今日发送量最后重置日期',
  `warmup_stage` tinyint(1) NOT NULL DEFAULT '0' COMMENT '暖机阶段0-5',
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1正常 0停用 2超配额 3连接失败',
  `last_check_at` int DEFAULT NULL COMMENT '最后检测时间',
  `last_error` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认账号',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `config` text COMMENT '账号级配置 JSON（自动回复等）',
  `creator_id` int NOT NULL DEFAULT '0',
  `tenant_id` int NOT NULL DEFAULT '0',
  `create_time` int DEFAULT NULL,
  `update_time` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Email发件账号表';

-- ── email_messages ──
CREATE TABLE `email_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL COMMENT '发件/收件账号ID',
  `thread_id` varchar(200) NOT NULL DEFAULT '' COMMENT '线程ID（按主题归组）',
  `message_uid` varchar(200) NOT NULL DEFAULT '' COMMENT 'IMAP UID 或发出时生成',
  `message_id_hdr` varchar(500) DEFAULT NULL COMMENT '邮件头 Message-ID',
  `in_reply_to` varchar(500) DEFAULT NULL COMMENT '邮件头 In-Reply-To',
  `direction` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0=收到 1=发出',
  `from_email` varchar(200) NOT NULL DEFAULT '' COMMENT '发件人邮箱',
  `from_name` varchar(200) NOT NULL DEFAULT '' COMMENT '发件人名称',
  `to_email` varchar(500) NOT NULL DEFAULT '' COMMENT '收件人邮箱（多个逗号分隔）',
  `to_name` varchar(500) NOT NULL DEFAULT '' COMMENT '收件人名称',
  `subject` varchar(500) NOT NULL DEFAULT '' COMMENT '邮件主题',
  `body_html` mediumtext COMMENT 'HTML 正文',
  `body_text` text COMMENT '纯文本正文',
  `body_translated` mediumtext,
  `translated_lang` varchar(16) NOT NULL DEFAULT '',
  `has_attachment` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否含附件',
  `attachments` text COMMENT '附件信息JSON',
  `is_read` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已读',
  `is_starred` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否星标',
  `lead_id` int DEFAULT NULL COMMENT '关联线索ID',
  `received_at` datetime DEFAULT NULL COMMENT '邮件时间',
  `create_time` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_uid` (`account_id`,`message_uid`),
  KEY `idx_account_thread` (`account_id`,`thread_id`),
  KEY `idx_account_recv` (`account_id`,`received_at`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_from_email` (`from_email`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件消息表';

-- ── email_templates ──
CREATE TABLE `email_templates` (
  `id` int NOT NULL,
  `tpl_name` varchar(200) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL COMMENT 'outreach/followup/greeting/promotion/common',
  `subject` varchar(500) DEFAULT NULL COMMENT '标题模板，{var} 占位',
  `body_html` mediumtext,
  `body_text` text,
  `variables` text COMMENT '变量定义 JSON：{name:说明}',
  `status` tinyint DEFAULT '1' COMMENT '1 启用 0 停用',
  `creator_id` int DEFAULT NULL,
  `tenant_id` int DEFAULT NULL,
  `create_time` int DEFAULT NULL,
  `update_time` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件模板库';

-- ── email_unsubscribe ──
CREATE TABLE `email_unsubscribe` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(200) NOT NULL COMMENT '退订邮箱',
  `reason` varchar(50) NOT NULL DEFAULT 'manual' COMMENT 'manual/bounce_hard/bounce_soft/complaint/unsubscribe_link',
  `source_task_id` int DEFAULT NULL COMMENT '来源任务ID',
  `unsubscribe_at` int DEFAULT NULL,
  `tenant_id` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email_tenant` (`email`(100),`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='退订黑名单表';

-- ── employees ──
CREATE TABLE `employees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '员工姓名',
  `employee_no` varchar(50) DEFAULT NULL COMMENT '工号',
  `department` varchar(100) DEFAULT NULL COMMENT '部门',
  `dept_code` varchar(20) DEFAULT NULL COMMENT '管理部门代码（CMD后台管理）',
  `hire_date` date DEFAULT NULL COMMENT '入职日期',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否在职',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `invitation_code` varchar(20) DEFAULT NULL COMMENT '员工邀请码',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_no` (`employee_no`),
  UNIQUE KEY `invitation_code` (`invitation_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='有KPI要求的员工';

-- ── enterprise_capability_items ──
CREATE TABLE `enterprise_capability_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint unsigned NOT NULL COMMENT '企业主体（v0.1 = 已认证 supplier.id）',
  `capability_type` varchar(32) NOT NULL COMMENT 'certification/experience/financial/personnel/localization/registration/technical/text',
  `name` varchar(255) NOT NULL COMMENT '业务名称',
  `value_json` json NOT NULL COMMENT '结构化能力值（kind + 字段，见数据契约 §3）',
  `evidence_refs_json` json DEFAULT NULL COMMENT 'EvidenceRef 数组',
  `confirmation_json` json DEFAULT NULL COMMENT '来源/确认人/确认时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cap_enterprise_type` (`enterprise_id`,`capability_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：企业能力项（结构化档案+证据）';

-- ── enterprise_evidence ──
CREATE TABLE `enterprise_evidence` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint unsigned NOT NULL COMMENT '企业主体（v0.1 = 已认证 supplier.id）',
  `upload_file_id` bigint unsigned DEFAULT NULL COMMENT '关联 upload_files 主键（无文件时为 NULL）',
  `upload_filename` varchar(255) DEFAULT NULL COMMENT '关联 upload_files.filename（主键即文件名）',
  `category` varchar(32) NOT NULL DEFAULT 'other' COMMENT 'cert/experience/financial/personnel/other',
  `title` varchar(255) NOT NULL COMMENT '业务名称（如 ISO 14001 证书）',
  `valid_from` date DEFAULT NULL COMMENT '证据有效期起',
  `valid_until` date DEFAULT NULL COMMENT '证据有效期止（NULL=长期有效，需 no_expiry=1）',
  `no_expiry` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=长期有效，与 valid_until 互斥',
  `tags_json` json DEFAULT NULL COMMENT '标签（行业/品类/地区等）',
  `confirmed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '用户是否确认过该证据',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evidence_enterprise` (`enterprise_id`,`category`),
  KEY `idx_evidence_valid_until` (`valid_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：企业证据/资料库最小版';

-- ── feasibility_reports ──
CREATE TABLE `feasibility_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notice_pk` bigint unsigned NOT NULL COMMENT '公告业务主键',
  `enterprise_id` bigint unsigned NOT NULL COMMENT '企业主体',
  `input_hash` char(64) NOT NULL COMMENT '输入快照 hash（公告+要求项版本+能力快照）',
  `report_json` json NOT NULL COMMENT '报告本体（verdict/gaps/matrix/unknowns/aiAdvice）',
  `prompt_version` varchar(64) NOT NULL COMMENT '生成 prompt 版本',
  `model` varchar(64) DEFAULT NULL COMMENT '生成所用模型（BYOK）',
  `status` varchar(16) NOT NULL DEFAULT 'ready' COMMENT 'queued/generating/ready/failed',
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT '人工复核人 user_id',
  `reviewed_at` datetime DEFAULT NULL COMMENT '人工复核时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_notice_enterprise_hash` (`notice_pk`,`enterprise_id`,`input_hash`),
  KEY `idx_report_enterprise` (`enterprise_id`,`created_at`),
  KEY `idx_report_notice` (`notice_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：报告版本与复核状态';

-- ── follow_up_logs ──
CREATE TABLE `follow_up_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `item_id` bigint unsigned NOT NULL COMMENT 'outreach_items.id',
  `follow_type` varchar(20) NOT NULL DEFAULT 'other' COMMENT 'call/email_reply/whatsapp/other',
  `reply_intent` varchar(20) DEFAULT NULL,
  `biz_status` varchar(20) DEFAULT NULL,
  `sales_feedback` varchar(20) DEFAULT NULL COMMENT '值得跟进/不匹配（商单维度反馈快照）',
  `content` text COMMENT '跟进内容（手动记录/流失原因等）',
  `next_follow_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='触达跟进台账（id≥100000 为后台写入段，导出不触碰）';

-- ── industry_nodes ──
CREATE TABLE `industry_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL COMMENT '行业码 UGT-I- + 定长分层数字（门类2位/大类4位/中类6位/小类与自研8位），码长即层级',
  `level` varchar(20) NOT NULL COMMENT 'section|division|group|subclass|extension',
  `parent_code` varchar(40) DEFAULT NULL,
  `name_zh` varchar(300) DEFAULT NULL COMMENT '国标官方中文名（含第1号修改单）',
  `name_en` varchar(300) DEFAULT NULL COMMENT 'ISIC Rev.4 官方英文，经国标附录C 对照定锚',
  `description` text COMMENT '国标官方释义',
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_level` (`level`),
  KEY `idx_parent` (`parent_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业树';

-- ── learning_material_purchases ──
CREATE TABLE `learning_material_purchases` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `material_id` varchar(64) NOT NULL COMMENT '资料ID（如 training-doc-01）',
  `order_no` varchar(64) NOT NULL COMMENT '关联支付订单号',
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '购买金额',
  `purchased_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '购买时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_material` (`user_id`,`material_id`),
  KEY `idx_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学习资料购买记录表。';

-- ── learning_materials ──
CREATE TABLE `learning_materials` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `material_id` varchar(64) NOT NULL COMMENT '资料唯一标识（如 training-doc-01）',
  `title_zh` varchar(255) NOT NULL,
  `title_en` varchar(255) NOT NULL DEFAULT '',
  `content_zh` text,
  `content_en` text,
  `category_zh` varchar(64) NOT NULL DEFAULT '',
  `category_en` varchar(64) NOT NULL DEFAULT '',
  `summary_zh` varchar(500) NOT NULL DEFAULT '',
  `summary_en` varchar(500) NOT NULL DEFAULT '',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '单价（元）',
  `file_url` varchar(500) NOT NULL DEFAULT '' COMMENT '静态文件路径',
  `file_name` varchar(255) NOT NULL DEFAULT '' COMMENT '下载文件名',
  `downloads_count` int unsigned NOT NULL DEFAULT '0',
  `is_premium` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否付费',
  `number` int unsigned NOT NULL DEFAULT '0' COMMENT '展示编号',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_material_id` (`material_id`),
  KEY `idx_category` (`category_zh`),
  KEY `idx_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学习资料表';

-- ── license_changes ──
CREATE TABLE `license_changes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `supplier_id` bigint unsigned NOT NULL COMMENT '供应商ID',
  `filename` varchar(120) DEFAULT NULL COMMENT '新执照文件名（upload_files）；NULL=申请清空执照',
  `prev_filename` varchar(120) DEFAULT NULL COMMENT '替换前的执照文件名（审计留痕，不随替换删除）',
  `uploaded_by` int unsigned DEFAULT NULL COMMENT '上传者 user id',
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态：先审后生效',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回原因',
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT '审核管理员 id',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_status` (`status`),
  KEY `idx_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='已认证供应商换照变更流水';

-- ── mass_send_logs ──
CREATE TABLE `mass_send_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `channel` enum('whatsapp','email') DEFAULT 'whatsapp',
  `email_account_id` int NOT NULL DEFAULT '0' COMMENT '邮件账号ID',
  `email_subject` varchar(500) NOT NULL DEFAULT '' COMMENT '邮件主题',
  `lead_id` int DEFAULT '0',
  `recipient` varchar(100) DEFAULT '',
  `recipient_name` varchar(100) DEFAULT '',
  `message_content` text,
  `media_url` varchar(500) DEFAULT NULL COMMENT '媒体文件URL（媒体群发时记录）',
  `send_status` enum('pending','sent','failed','cancelled') DEFAULT NULL,
  `send_time` datetime DEFAULT NULL,
  `scheduled_at` datetime DEFAULT NULL COMMENT '计划发送时间',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `tenant_id` int NOT NULL DEFAULT '0' COMMENT '租户ID',
  `reply_time` datetime DEFAULT NULL,
  `error_msg` varchar(500) DEFAULT '',
  `email_message_id` varchar(200) DEFAULT NULL COMMENT 'SMTP Message-ID',
  PRIMARY KEY (`id`),
  KEY `idx_task` (`task_id`,`send_status`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_reply` (`reply_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── mass_send_tasks ──
CREATE TABLE `mass_send_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_name` varchar(100) NOT NULL,
  `channel` enum('whatsapp','email') DEFAULT 'whatsapp',
  `email_subject` varchar(200) DEFAULT NULL COMMENT 'Email主题(channel=email时用)',
  `email_account_id` int DEFAULT NULL COMMENT 'Email发件账号ID',
  `template_id` int NOT NULL,
  `msg_type` varchar(20) NOT NULL DEFAULT 'text' COMMENT '消息类型: text/image/video/document',
  `media_url` varchar(500) DEFAULT NULL COMMENT '媒体文件URL',
  `media_filename` varchar(255) DEFAULT NULL COMMENT '媒体文件名',
  `target_lead_ids` text,
  `use_ai` tinyint(1) DEFAULT '0',
  `custom_vars` json DEFAULT NULL,
  `total_count` int DEFAULT '0',
  `sent_count` int DEFAULT '0',
  `success_count` int DEFAULT '0',
  `reply_count` int DEFAULT '0',
  `status` enum('draft','pending','sending','completed','failed','paused','cancelled') DEFAULT NULL,
  `creator_id` int DEFAULT '0',
  `account_id` int DEFAULT '0',
  `tenant_id` int DEFAULT '0',
  `scheduled_task_id` int unsigned DEFAULT NULL COMMENT '关联定时任务ID',
  `create_time` datetime DEFAULT NULL,
  `complete_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_creator` (`creator_id`,`create_time`),
  KEY `idx_status` (`status`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── match_verdict ──
CREATE TABLE `match_verdict` (
  `supplier_id` int NOT NULL COMMENT '内网爬虫库 supplier.id',
  `opportunity_id` int NOT NULL,
  `verdict` varchar(8) DEFAULT NULL COMMENT '相关/擦边/无关',
  `why` varchar(500) DEFAULT NULL COMMENT 'LLM 判定理由原文',
  `prof` float DEFAULT NULL,
  `family` varchar(200) DEFAULT NULL,
  `judged_at` datetime DEFAULT NULL,
  PRIMARY KEY (`supplier_id`,`opportunity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='LLM 供需匹配终审';

-- ── message_tracking ──
CREATE TABLE `message_tracking` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `channel` varchar(20) NOT NULL,
  `message_id` varchar(80) NOT NULL,
  `provider_message_id` varchar(500) DEFAULT NULL,
  `mass_log_id` bigint unsigned DEFAULT NULL,
  `notification_dispatch_id` bigint unsigned DEFAULT NULL,
  `account_id` bigint unsigned DEFAULT NULL,
  `lead_id` bigint unsigned DEFAULT NULL,
  `conversation_id` varchar(200) DEFAULT NULL,
  `recipient` varchar(500) NOT NULL DEFAULT '',
  `recipient_name` varchar(200) DEFAULT NULL,
  `subject` varchar(500) DEFAULT NULL,
  `message_content` mediumtext,
  `tracking_token` char(64) DEFAULT NULL,
  `callback_url` varchar(1000) DEFAULT NULL,
  `callback_secret` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(160) DEFAULT NULL,
  `metadata` longtext,
  `status` enum('queued','sending','sent','delivered','opened','read','played','replied','failed','bounced') NOT NULL DEFAULT 'queued',
  `error_message` varchar(1000) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL COMMENT '打开/回复的权威来源',
  `last_open_at` datetime DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `played_at` datetime DEFAULT NULL,
  `replied_at` datetime DEFAULT NULL,
  `open_count` int unsigned NOT NULL DEFAULT '0',
  `reply_count` int unsigned NOT NULL DEFAULT '0',
  `reply_message_id` varchar(500) DEFAULT NULL,
  `reply_subject` varchar(500) DEFAULT NULL,
  `reply_preview` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_message_id` (`message_id`),
  UNIQUE KEY `uq_tracking_token` (`tracking_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件发送/打开/回复跟踪';

-- ── message_tracking_callbacks ──
CREATE TABLE `message_tracking_callbacks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_key` char(64) NOT NULL,
  `message_id` varchar(80) NOT NULL,
  `event` varchar(80) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `next_attempt_at` datetime NOT NULL,
  `last_error` varchar(1000) DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_message_tracking_callback_event` (`event_key`),
  KEY `idx_message_tracking_callback_retry` (`delivered_at`,`next_attempt_at`,`attempts`),
  KEY `idx_message_tracking_callback_message` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── monthly_kpi ──
CREATE TABLE `monthly_kpi` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL COMMENT '关联员工',
  `kpi_month` varchar(7) NOT NULL COMMENT '考核月份，格式 YYYY-MM',
  `kpi_personal` int unsigned NOT NULL DEFAULT '0' COMMENT '外贸员注册KPI目标',
  `kpi_enterprise` int unsigned NOT NULL DEFAULT '0' COMMENT '企业注册KPI目标',
  `actual_personal` int unsigned NOT NULL DEFAULT '0' COMMENT '外贸员实际完成数',
  `actual_enterprise` int unsigned NOT NULL DEFAULT '0' COMMENT '企业实际完成数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_month` (`employee_id`,`kpi_month`),
  CONSTRAINT `fk_monthly_kpi_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工月度KPI完成情况';

-- ── notice_ai_summaries ──
CREATE TABLE `notice_ai_summaries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned NOT NULL,
  `core_deliverables` text,
  `key_qualifications` text,
  `payment_cycle` text,
  `risk_alerts` text,
  `model` varchar(100) NOT NULL,
  `provider_base_url` varchar(500) NOT NULL,
  `input_tokens` int unsigned DEFAULT NULL,
  `output_tokens` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `competitive_landscape` text COMMENT '竞争格局分析',
  `bid_strategy` text COMMENT '投标策略建议',
  `score_qualification` tinyint unsigned DEFAULT NULL COMMENT '资质匹配度(0-100)',
  `score_experience` tinyint unsigned DEFAULT NULL COMMENT '经验匹配度(0-100)',
  `score_certification` tinyint unsigned DEFAULT NULL COMMENT '认证覆盖度(0-100)',
  `score_region` tinyint unsigned DEFAULT NULL COMMENT '地域适配度(0-100)',
  `score_scale` tinyint unsigned DEFAULT NULL COMMENT '规模匹配度(0-100)',
  `score_delivery` tinyint unsigned DEFAULT NULL COMMENT '交期适配度(0-100)',
  `score_price` tinyint unsigned DEFAULT NULL COMMENT '价格竞争力(0-100)',
  `score_overall` tinyint unsigned DEFAULT NULL COMMENT '综合适配分(0-100)',
  `score_reasons` text COMMENT '各维度评分理由JSON',
  `score_reasoning` text COMMENT 'AI评分思维链推理过程文本',
  `match_results` text COMMENT 'AI 智能匹配 Top N 结果JSON（与评分 score_reasons 分键）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_notice` (`user_id`,`notice_id`),
  KEY `idx_notice` (`notice_id`),
  KEY `idx_user_created` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI投标结果分析';

-- ── notice_amount_cache ──
CREATE TABLE `notice_amount_cache` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notice_id` bigint unsigned NOT NULL,
  `amount` decimal(20,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `amount_usd` decimal(20,2) DEFAULT NULL,
  `inferred` tinyint(1) NOT NULL DEFAULT '0',
  `parse_version` smallint NOT NULL DEFAULT '1',
  `parsed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notice` (`notice_id`),
  KEY `idx_version` (`parse_version`),
  KEY `idx_amount_cache_notice_amount` (`notice_id`,`amount_usd`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告金额解析缓存表';

-- ── notice_attachment_text ──
CREATE TABLE `notice_attachment_text` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notice_pk` int NOT NULL,
  `source_url` varchar(1024) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `http_status` int DEFAULT NULL,
  `content_type` varchar(100) DEFAULT NULL,
  `bytes` int DEFAULT NULL,
  `text_chars` int NOT NULL DEFAULT '0',
  `text_text` longtext,
  `sha256` char(64) DEFAULT NULL,
  `parser` varchar(32) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `error` varchar(255) DEFAULT NULL,
  `fetched_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_url` (`notice_pk`,`source_url`(255)),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_attribution_nodes ──
CREATE TABLE `notice_attribution_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notice_pk` int unsigned NOT NULL COMMENT 'bid_notices.id 内部主键；不用 notice_id 外部编号（实测撞号）',
  `node_code` varchar(40) NOT NULL COMMENT '最深落点 UGT-*；祖先不落库，由 attribution.pathOfLandingNodes 现算',
  `level` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '由 node_code 码长唯一决定，仅冗余展示用，不作任何判据',
  `confidence` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'AI 置信；legacy_tag 固定 1.00',
  `source` varchar(20) NOT NULL COMMENT 'legacy_tag / ai / manual',
  `model` varchar(64) NOT NULL DEFAULT '' COMMENT '产出模型标识，审计用',
  `evidence_text` varchar(1000) DEFAULT NULL COMMENT '原文证据',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notice_node` (`notice_pk`,`node_code`),
  KEY `idx_source_notice` (`source`,`notice_pk`),
  KEY `idx_node` (`node_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告品目对照表';

-- ── notice_backbone_nodes ──
CREATE TABLE `notice_backbone_nodes` (
  `notice_id` bigint unsigned NOT NULL COMMENT '公告主键 id（=bid_notices.id=notice_search.id）',
  `node` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '品目节点的码（UGT-B-…，含全部祖先；由 backbone-path 从公告品目标签换算；字符集/排序规则故意与 commodity_backbone.code 一致，否则两边比较会转列吃索引）',
  PRIMARY KEY (`notice_id`,`node`),
  KEY `idx_node` (`node`,`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告×品目骨架节点码倒排表';

-- ── notice_body ──
CREATE TABLE `notice_body` (
  `notice_pk` int NOT NULL,
  `body_text` longtext,
  `body_chars` int NOT NULL DEFAULT '0',
  `body_source` varchar(20) NOT NULL,
  `content_level` varchar(20) NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`),
  KEY `idx_chars` (`body_chars`),
  KEY `idx_level` (`content_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_content_lock ──
CREATE TABLE `notice_content_lock` (
  `notice_pk` int NOT NULL,
  `old_description` longtext,
  `old_chars` int NOT NULL DEFAULT '0',
  `new_source` varchar(20) NOT NULL DEFAULT 'attachment',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_deadline ──
CREATE TABLE `notice_deadline` (
  `notice_pk` int NOT NULL,
  `deadline_state` varchar(20) NOT NULL COMMENT 'known/unknown/placeholder/typo_suspect/framework_end/invalid',
  `deadline_type` varchar(20) NOT NULL DEFAULT 'bid' COMMENT 'bid/framework_end/registration/award/info',
  `effective_ts` bigint DEFAULT NULL COMMENT '对外有效截止时间（UTC 秒）；不可信时为 NULL',
  `confidence` tinyint NOT NULL DEFAULT '0' COMMENT '0-100',
  `reason` varchar(255) DEFAULT NULL,
  `source_rule` varchar(64) DEFAULT NULL,
  `source_value` varchar(50) DEFAULT NULL COMMENT '原始 deadline 文本，留证',
  `deadline_timezone` varchar(64) DEFAULT NULL COMMENT '源时间时区/偏移',
  `timezone_source` varchar(20) DEFAULT NULL COMMENT 'explicit/date/assumed_utc',
  `reviewed_by` varchar(64) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`),
  KEY `idx_state_type` (`deadline_state`,`deadline_type`),
  KEY `idx_effective` (`effective_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告截止时间语义层；主表 deadline/deadline_ts 保留为源值';

-- ── notice_deadline_lock ──
CREATE TABLE `notice_deadline_lock` (
  `notice_pk` int NOT NULL,
  `old_deadline` varchar(50) DEFAULT NULL,
  `old_deadline_ts` bigint DEFAULT NULL,
  `new_deadline` varchar(50) DEFAULT NULL,
  `new_deadline_ts` bigint DEFAULT NULL,
  `state` varchar(20) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_deadline_quarantine ──
CREATE TABLE `notice_deadline_quarantine` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notice_pk` int NOT NULL,
  `raw_deadline` varchar(50) DEFAULT NULL,
  `raw_deadline_ts` bigint DEFAULT NULL,
  `published_date` varchar(50) DEFAULT NULL,
  `state` varchar(20) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',
  `reviewer` varchar(64) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_pk` (`notice_pk`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='截止时间可疑值隔离队列；API 默认不返回';

-- ── notice_favorites ──
CREATE TABLE `notice_favorites` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_notice` (`user_id`,`notice_id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `idx_notice` (`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='收藏公告';

-- ── notice_interests ──
CREATE TABLE `notice_interests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned NOT NULL,
  `interest_type` enum('interested','subscribed') NOT NULL DEFAULT 'interested',
  `source` varchar(40) NOT NULL DEFAULT 'detail_page',
  `note` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_notice_type` (`user_id`,`notice_id`,`interest_type`),
  KEY `idx_notice_type` (`notice_id`,`interest_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告意向表。（感兴趣/订阅）';

-- ── notice_public ──
CREATE TABLE `notice_public` (
  `notice_pk` int NOT NULL COMMENT '公告主键，=bid_notices.id，服务表 1:1 幂等锚点',
  `notice_id` varchar(100) NOT NULL COMMENT '外部公告编号（源库业务ID），API 对外查找键（UNIQUE，无编号行不入表）',
  `source_url` varchar(1024) DEFAULT NULL COMMENT '公告原文链接',
  `reference` varchar(255) DEFAULT NULL COMMENT '采购/标段参考编号',
  `title` varchar(500) DEFAULT NULL COMMENT '归一化标题（去噪后）',
  `title_cn` varchar(1000) DEFAULT NULL COMMENT '中文标题缓存，来源 notice_translations.title_tr(lang=zh)',
  `description` longtext COMMENT '正文，优先取旁表 body_text，回退主表 description',
  `description_cn` longtext COMMENT '中文译文，仅当关联到已译商机时非空（稀疏，非全量译文库）',
  `content_level` varchar(20) DEFAULT NULL COMMENT '正文质量分级：empty/echo/thin/substantive',
  `published_ts` bigint DEFAULT NULL COMMENT '发布时间 epoch 秒（UTC）',
  `deadline_ts` bigint DEFAULT NULL COMMENT '截止时间 epoch 秒，仅 deadline_state=known 时有值',
  `deadline_state` varchar(20) DEFAULT NULL COMMENT '截止语义状态：known/unknown/placeholder/typo_suspect 等',
  `deadline_type` varchar(20) DEFAULT NULL COMMENT '截止类型：bid/registration/framework_end（展示事实）',
  `deadline_timezone` varchar(64) DEFAULT NULL COMMENT '截止时间展示时区/偏移（展示事实）',
  `country_code` char(2) DEFAULT NULL COMMENT '主国家 ISO2 码（别名归一后）',
  `country_codes` json DEFAULT NULL COMMENT '全部国家 ISO2 码数组（多国家公告）',
  `notice_type_code` varchar(30) DEFAULT NULL COMMENT '采购类型归一码（normalizeNoticeType 单一事实源）',
  `platform_name` varchar(100) DEFAULT NULL COMMENT '发布平台规范名（platform 别名归一后）',
  `buyer_name` varchar(500) DEFAULT NULL COMMENT '采购人/机构规范名（agency 别名归一后）',
  `buyer_id` bigint unsigned DEFAULT NULL COMMENT '买家实体 ID（buyer.buyer_id）',
  `buyer_name_cn` varchar(500) DEFAULT NULL COMMENT '中文买家名缓存，来源 buyer.name_zh',
  `buyer_group` varchar(100) DEFAULT NULL COMMENT '机构类型分类键（classifyAgencyType 的 typeKey）',
  `estimated_value` decimal(20,2) DEFAULT NULL COMMENT '预算金额（归一数值）',
  `currency_code` char(3) DEFAULT NULL COMMENT '币种 ISO4217 码',
  `currency_source` varchar(20) DEFAULT NULL COMMENT '币种判定来源（见 normalizeAmount）',
  `contacts` json DEFAULT NULL COMMENT '联系方式数组（归一，正则抽取，需按可信度使用）',
  `attachments` json DEFAULT NULL COMMENT '附件列表（旁表 attachment_text 优先，回退 documents/procurement_files）',
  `external_links` json DEFAULT NULL COMMENT '外部链接（已排除与附件重复项）',
  `difficulty` varchar(20) DEFAULT NULL COMMENT '采购难度：low/medium/high/unknown',
  `registration_level` varchar(20) DEFAULT NULL COMMENT '注册层级：basic/level1..3/medium/high/standard/unknown',
  `beneficiary_countries` varchar(500) DEFAULT NULL COMMENT '受援国/受益国（原文列表）',
  `updated_at` bigint DEFAULT NULL COMMENT '行刷新水位 epoch 秒（增量 reconcile 依据）',
  `industry` varchar(100) DEFAULT NULL COMMENT '行业 slug（约 239 类，主表直取，已归一）',
  `is_opportunity` tinyint NOT NULL DEFAULT '0' COMMENT '是否商机：1=存在人工拆单且合格/在架/过审商机；0 否（不含 is_featured）',
  PRIMARY KEY (`notice_pk`),
  KEY `idx_deadline` (`deadline_ts`),
  KEY `idx_country_type` (`country_code`,`notice_type_code`),
  KEY `idx_deadline_state_ts` (`deadline_state`,`deadline_ts`),
  UNIQUE KEY `uq_notice_id` (`notice_id`),
  FULLTEXT KEY `ft_title_desc` (`title`,`description`) /*!50100 WITH PARSER ngram */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='服务表';

-- ── notice_requirement_items ──
CREATE TABLE `notice_requirement_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notice_pk` bigint unsigned NOT NULL COMMENT '公告业务主键，对应 notice_public.notice_pk',
  `version` int unsigned NOT NULL DEFAULT '1' COMMENT '抽取版本：重抽 +1，历史版本保留',
  `seq` int unsigned NOT NULL COMMENT '项序号：同版本内唯一，跨版本稳定复用',
  `requirement_type` varchar(32) NOT NULL COMMENT 'certification/experience/financial/personnel/localization/registration/technical/commercial/delivery/submission/bond/language/warranty/other',
  `importance` varchar(16) NOT NULL DEFAULT 'scored' COMMENT 'mandatory=废标项/scored=评分项/preferred=加分项',
  `title` varchar(255) NOT NULL COMMENT '业务可读标题',
  `value_json` json DEFAULT NULL COMMENT '结构化要求（无法结构化时为空，用 raw_text）',
  `raw_text` text NOT NULL COMMENT '公告原文片段（供人工复核）',
  `source_json` json NOT NULL COMMENT '证据锚点：kind/ref/locator/quote/capturedAt',
  `extraction_method` varchar(16) NOT NULL DEFAULT 'llm' COMMENT 'rule/llm/manual',
  `confidence` decimal(3,2) NOT NULL DEFAULT '0.00' COMMENT '抽取置信度 0~1',
  `prompt_version` varchar(64) DEFAULT NULL COMMENT '抽取 prompt 版本，便于复现',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_req_notice_version_seq` (`notice_pk`,`version`,`seq`),
  KEY `idx_req_notice_version` (`notice_pk`,`version`),
  KEY `idx_req_type` (`requirement_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标可行性报告：公告要求项（结构化+原文锚点）';

-- ── notice_search ──
CREATE TABLE `notice_search` (
  `id` int unsigned NOT NULL,
  `notice_id` varchar(100) NOT NULL,
  `title` varchar(1000) NOT NULL DEFAULT '',
  `reference` varchar(200) NOT NULL DEFAULT '',
  `description` text NOT NULL,
  `title_zh` varchar(1000) NOT NULL DEFAULT '',
  `description_zh` text NOT NULL,
  `title_en` varchar(1000) NOT NULL DEFAULT '',
  `description_en` text NOT NULL,
  `country_name` varchar(100) NOT NULL DEFAULT '' COMMENT '主国家英文标准名（投影自 notice_public.country_name，与归一层同名）',
  `country_codes` varchar(500) NOT NULL DEFAULT '' COMMENT '拆分后的可筛国家 ISO2 码集(逗号分隔，纯表驱动回填)',
  `buyer_name` varchar(200) NOT NULL DEFAULT '' COMMENT '采购主体规范名（投影自 notice_public.buyer_name，与归一层同名）',
  `buyer_group` varchar(100) NOT NULL DEFAULT '' COMMENT '机构类型分类键（投影自 notice_public.buyer_group，与归一层同名）',
  `is_opportunity` tinyint(1) NOT NULL DEFAULT '0' COMMENT '商机集合（投影自 notice_public.is_opportunity；精选/合格商机并集）',
  `notice_type_code` varchar(20) NOT NULL DEFAULT '' COMMENT '采购类型归一码（投影自 notice_public.notice_type_code，与归一层同名）',
  `deadline_sec` bigint unsigned NOT NULL DEFAULT '0',
  `estimated_value` decimal(20,2) NOT NULL DEFAULT '0.00',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `entry_source` varchar(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源（同步自主表）',
  `description_cn` varchar(500) NOT NULL DEFAULT '',
  `bid_overview` varchar(200) NOT NULL DEFAULT '',
  `beneficiary_countries` varchar(300) NOT NULL DEFAULT '',
  `documents_count` smallint unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `title_fr` varchar(1000) NOT NULL DEFAULT '',
  `description_fr` text NOT NULL,
  `title_ru` varchar(1000) NOT NULL DEFAULT '',
  `title_es` varchar(1000) NOT NULL DEFAULT '',
  `description_ru` text NOT NULL,
  `description_ar` text NOT NULL,
  `description_es` text NOT NULL,
  `title_ar` varchar(1000) NOT NULL DEFAULT '',
  `published_date` varchar(50) DEFAULT NULL COMMENT '公告发布日期（同步自 bid_notices.published_date）',
  `sync_src_hash` char(32) NOT NULL DEFAULT '' COMMENT '宽表内容与输入快照的一致性指纹，由 buildWideRow 同快照写入，对账只比对不修改',
  `backbone_path` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '公告归属的品目骨架节点码（UGT-B-…，含全部祖先，逗号分隔；由 backbone-path 换算）',
  PRIMARY KEY (`id`),
  KEY `idx_ns_deadline_desc` (`deadline_sec` DESC),
  KEY `idx_ns_id_desc` (`id` DESC),
  KEY `idx_ns_deadline` (`deadline_sec`),
  KEY `idx_ns_country_name` (`country_name`),
  KEY `idx_ns_buyer_group` (`buyer_group`),
  KEY `idx_ns_type_code` (`notice_type_code`),
  KEY `idx_ns_featured` (`is_featured`),
  KEY `idx_ns_reference` (`reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='宽表';

-- ── notice_title ──
CREATE TABLE `notice_title` (
  `notice_pk` int NOT NULL,
  `title_raw` varchar(500) DEFAULT NULL,
  `title_clean` varchar(500) DEFAULT NULL,
  `title_suggested` varchar(500) DEFAULT NULL,
  `title_quality` varchar(20) NOT NULL,
  `title_source` varchar(20) NOT NULL,
  `changed` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`),
  KEY `idx_quality` (`title_quality`),
  KEY `idx_changed` (`changed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_title_lock ──
CREATE TABLE `notice_title_lock` (
  `notice_pk` int NOT NULL,
  `old_title` varchar(500) DEFAULT NULL,
  `new_title` varchar(500) DEFAULT NULL,
  `reason` varchar(64) NOT NULL DEFAULT 'title-normalize',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notice_pk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── notice_translations ──
CREATE TABLE `notice_translations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notice_id` bigint unsigned NOT NULL,
  `lang` varchar(10) NOT NULL,
  `title_tr` text,
  `description_tr` mediumtext,
  `model` varchar(60) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notice_lang` (`notice_id`,`lang`),
  KEY `idx_lang` (`lang`),
  KEY `idx_translations_notice_lang` (`notice_id`,`lang`),
  FULLTEXT KEY `ft_trans_search` (`title_tr`,`description_tr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='翻译表';

-- ── notifications ──
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '收件人 user_id',
  `type` varchar(32) NOT NULL COMMENT '类型：rfq_new/rfq_quoted/rfq_won 等',
  `title` varchar(200) NOT NULL COMMENT '标题',
  `body` varchar(500) DEFAULT NULL COMMENT '正文摘要',
  `link` varchar(200) DEFAULT NULL COMMENT '跳转链接，如 /rfq/{id}',
  `ref_id` bigint unsigned DEFAULT NULL COMMENT '关联业务对象 id，幂等/去重用',
  `is_read` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0未读 1已读',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`,`is_read`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站内信收件箱：RFQ闭环等站内提醒；ref_id 供幂等去重';

-- ── opportunity_translations ──
CREATE TABLE `opportunity_translations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `opportunity_id` bigint unsigned NOT NULL,
  `lang` varchar(10) NOT NULL,
  `title_tr` text,
  `description_tr` mediumtext,
  `model` varchar(60) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_opp_lang` (`opportunity_id`,`lang`),
  KEY `idx_opp_tr_lang` (`lang`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机会公告翻译表';

-- ── opportunity_unlocks ──
CREATE TABLE `opportunity_unlocks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `opportunity_id` bigint unsigned DEFAULT NULL,
  `notice_id` bigint unsigned DEFAULT NULL,
  `unlock_type` enum('free','single','subscription') NOT NULL DEFAULT 'free',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `unlocked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_opportunity` (`user_id`,`opportunity_id`),
  UNIQUE KEY `uk_user_notice` (`user_id`,`notice_id`),
  KEY `idx_opportunity_id` (`opportunity_id`),
  KEY `idx_notice_id` (`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机解锁流水。';

-- ── password_resets ──
CREATE TABLE `password_resets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `code` varchar(128) NOT NULL,
  `code_type` varchar(20) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `attempts` int NOT NULL DEFAULT '0',
  `ip` varchar(45) DEFAULT NULL,
  `email_sent` tinyint(1) NOT NULL DEFAULT '0',
  `email_error` varchar(500) DEFAULT NULL,
  `sms_sent` tinyint(1) NOT NULL DEFAULT '0',
  `sms_error` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_code_type_lookup` (`user_id`,`code_type`,`used`,`expires_at`,`created_at`),
  KEY `idx_phone_lookup` (`phone`,`code_type`,`used`,`expires_at`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='验证码下发表';

-- ── payment_orders ──
CREATE TABLE `payment_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `order_no` varchar(80) NOT NULL,
  `provider` enum('alipay','wechat','mock') NOT NULL,
  `plan_code` varchar(60) NOT NULL,
  `order_type` varchar(20) NOT NULL DEFAULT 'new',
  `original_order_no` varchar(80) DEFAULT NULL,
  `notice_id` bigint unsigned DEFAULT NULL,
  `industry_code` varchar(32) DEFAULT NULL COMMENT '购买时选择的 L1 品目大类节点码（UGT-01…）',
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `status` enum('pending','paid','closed','failed','refunded') NOT NULL DEFAULT 'pending',
  `provider_trade_no` varchar(120) DEFAULT NULL,
  `pay_url` text,
  `qr_code_url` text,
  `raw_request` json DEFAULT NULL,
  `raw_notify` json DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `idx_user_status` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付订单。';

-- ── payment_provider_configs ──
CREATE TABLE `payment_provider_configs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider` enum('alipay','wechat') NOT NULL,
  `mode` varchar(30) NOT NULL DEFAULT 'mock',
  `app_id` varchar(190) DEFAULT NULL,
  `merchant_id` varchar(190) DEFAULT NULL,
  `notify_url` varchar(500) DEFAULT NULL,
  `return_url` varchar(500) DEFAULT NULL,
  `public_key` text,
  `private_key_ref` text,
  `cert_ref` varchar(500) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_mode` (`provider`,`mode`),
  KEY `idx_provider_active` (`provider`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付信息配置';

-- ── plan_benefits ──
CREATE TABLE `plan_benefits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(64) NOT NULL COMMENT 'FK plan_catalog：这一格属于哪档套餐',
  `benefit_code` varchar(64) NOT NULL COMMENT 'FK benefit_catalog：这一格是哪个权益',
  `value_level` int DEFAULT NULL COMMENT '层级值：布尔行只允许 0/1；枚举行 0..4，含义查权益目录 level_dict',
  `value_num` int DEFAULT NULL COMMENT '额度值：正整数=数量；-1=不限（全库唯一的不限表达，禁止用大数字冒充）；0=该档明确无额度（如普通用户免费额度 0 条）',
  `value_amount` decimal(10,2) DEFAULT NULL COMMENT '金额值：0.00=该档包含/免费；正数=该档会员价',
  `note_zh` varchar(255) DEFAULT NULL COMMENT '格级边界说明，如"批量下载按增值服务计费"，前端锁定态提示直接渲染',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_benefit` (`plan_code`,`benefit_code`),
  KEY `idx_benefit` (`benefit_code`,`plan_code`),
  CONSTRAINT `fk_pb_benefit` FOREIGN KEY (`benefit_code`) REFERENCES `benefit_catalog` (`benefit_code`),
  CONSTRAINT `fk_pb_plan` FOREIGN KEY (`plan_code`) REFERENCES `plan_catalog` (`plan_code`),
  CONSTRAINT `chk_one_value` CHECK (((((`value_level` is not null) + (`value_num` is not null)) + (`value_amount` is not null)) = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐权益矩阵表';

-- ── plan_catalog ──
CREATE TABLE `plan_catalog` (
  `plan_code` varchar(64) NOT NULL COMMENT '套餐稳定机器码，下架不复用',
  `name_en` varchar(40) NOT NULL COMMENT '官网档位英文名：STARTER/PRO/UNLIMITED/BUSINESS/ADVISOR/ENTERPRISE',
  `name_zh` varchar(80) NOT NULL COMMENT '官网档位中文名',
  `positioning_zh` varchar(255) NOT NULL COMMENT '核心定位一句话，用于套餐卡副标题',
  `price` decimal(10,2) NOT NULL COMMENT '官网标价；price_mode=free 时必为 0.00，price_mode=contact 时亦 0.00 且不得用于展示或计费',
  `price_mode` enum('fixed','contact','free') NOT NULL DEFAULT 'fixed' COMMENT 'fixed=明码标价可自助支付；contact=商务报价、必须转销售不得开单；free=普通用户档（不售卖、不得建订阅）',
  `price_incl_tax` tinyint(1) DEFAULT NULL COMMENT '含税口径 1=含税/0=未税/NULL=未定（付款页定稿前恒 NULL）；NULL 期间本表价格仅作报价参考、不得开票，不阻止自助成交（决策记录：docs/数据库设计/权益体系-数据库设计总览.md §5.2）',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `billing_period_days` int DEFAULT NULL COMMENT '计费周期天数，365=年付；NULL=一次性交付或按合同约定',
  `commercial_tier` enum('L1','L2','L3','L4','L5','L6') NOT NULL COMMENT '商业层级（数据体验/个人专业/企业智能/企业顾问/项目服务/数据授权），仅用于商品归组与报表，不作门控依据',
  `cta_i18n_key` varchar(64) NOT NULL COMMENT '官网按钮的 i18n 键',
  `badge` enum('none','most_popular','best_value','custom') NOT NULL DEFAULT 'none' COMMENT '官网角标：无/最受欢迎/企业推荐/定制方案',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '官网六卡横向顺序',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=在售；调价必须新版本行+旧行下架，禁止原地改已成交价',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `upgrade_credit_days` smallint DEFAULT NULL COMMENT '升级全额抵扣窗口天数：自订阅生效起 N 天内升级按补差价（=已付款全额抵扣），超窗口不给抵扣改按目标档原价新购；NULL=本档不承诺抵扣（沿用补差价）；来源：docs/云境产品服务权益报价表_260928.xlsx 个人体验版/个人标准版行',
  PRIMARY KEY (`plan_code`),
  KEY `idx_active_sort` (`is_active`,`sort_order`),
  KEY `idx_tier` (`commercial_tier`),
  CONSTRAINT `chk_price_mode` CHECK (((`price_mode` <> _utf8mb4'fixed') or (`price` > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐目录表：仅承担商品属性，不承载权益内容';

-- ── plan_subscriptions ──
CREATE TABLE `plan_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` bigint unsigned NOT NULL COMMENT '订阅归属人（企业档为主账号）；单轨非空',
  `plan_code` varchar(64) NOT NULL COMMENT 'FK plan_catalog：买了哪档',
  `source_order_no` varchar(80) NOT NULL COMMENT '成交订单号，非空硬约束——无订单来源的订阅禁止存在，退款与对账唯一锚点',
  `industry_code` varchar(32) DEFAULT NULL COMMENT '订阅周期内强绑定的 L1 品目大类节点码（UGT-01…）；续费/升级重新选择',
  `price_paid` decimal(10,2) NOT NULL COMMENT '实付金额快照（升级补差时不等于套餐标价），财务口径',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `status` enum('active','expired','cancelled','refunded') NOT NULL DEFAULT 'active' COMMENT '仅 active 享有权益门控',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL COMMENT '到期时间；NULL=永久（结构预留，当前各档均年付）',
  `replaced_by_id` bigint unsigned DEFAULT NULL COMMENT '升级链指针：本单被哪一单替代，可 JOIN 追溯承接关系',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_owner_status` (`owner_user_id`,`status`,`expires_at`),
  KEY `idx_plan` (`plan_code`),
  KEY `idx_source_order` (`source_order_no`),
  KEY `fk_sub_replaced__p3` (`replaced_by_id`),
  CONSTRAINT `fk_sub_plan__p3` FOREIGN KEY (`plan_code`) REFERENCES `plan_catalog` (`plan_code`),
  CONSTRAINT `fk_sub_replaced__p3` FOREIGN KEY (`replaced_by_id`) REFERENCES `plan_subscriptions` (`id`),
  CONSTRAINT `crm_plan_subscriptions_chk_1` CHECK (((`expires_at` is null) or (`expires_at` > `started_at`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐订阅表：记录用户对套餐的每一次购买事实（归属人、成交订单号、实付与席位快照、有效期与状态、升级链）';

-- ── platform_aliases ──
CREATE TABLE `platform_aliases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `canonical` varchar(100) NOT NULL COMMENT '平台官方简称（归一锚点）',
  `platform_code` varchar(50) DEFAULT NULL COMMENT '稳定 slug（筛选/聚合用）',
  `alias` varchar(255) NOT NULL COMMENT '变体（域名/下划线码/Camel/显示名/短码）',
  `normalized_alias` varchar(255) GENERATED ALWAYS AS (upper(trim(`alias`))) STORED,
  `host` varchar(120) DEFAULT NULL COMMENT '注册域（子域后缀匹配），纯码/名行为 NULL',
  `kind` enum('platform','other','invalid') NOT NULL DEFAULT 'platform',
  `name_i18n` json DEFAULT NULL COMMENT '多语言展示名{zh,en}',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `source_ref` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_normalized_alias` (`normalized_alias`),
  KEY `idx_canonical` (`canonical`),
  KEY `idx_code` (`platform_code`),
  KEY `idx_host` (`host`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='来源/采购平台归一化';

-- ── product_keyword_groups ──
CREATE TABLE `product_keyword_groups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(100) NOT NULL,
  `terms` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_name` (`user_id`,`name`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='关键词组';

-- ── reco_follow_up_logs ──
CREATE TABLE `reco_follow_up_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `reco_item_id` bigint NOT NULL,
  `follow_type` varchar(32) NOT NULL,
  `reply_intent` varchar(32) DEFAULT NULL,
  `biz_status` varchar(32) DEFAULT NULL,
  `sales_feedback` varchar(32) DEFAULT NULL,
  `content` text,
  `next_follow_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reco_item` (`reco_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── reco_outreach_items ──
CREATE TABLE `reco_outreach_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_no` varchar(64) NOT NULL,
  `supplier_id` bigint NOT NULL,
  `company_name` varchar(255) NOT NULL DEFAULT '',
  `salutation` varchar(128) NOT NULL DEFAULT '',
  `email` varchar(255) NOT NULL DEFAULT '',
  `phone` varchar(128) NOT NULL DEFAULT '',
  `reco_id` bigint DEFAULT NULL,
  `reco_family` varchar(64) DEFAULT NULL,
  `reco_opp_id` bigint DEFAULT NULL,
  `reco_top3` varchar(255) DEFAULT NULL,
  `ab_variant` varchar(32) NOT NULL DEFAULT 'new',
  `send_status` varchar(32) NOT NULL DEFAULT 'pending',
  `message_id` varchar(255) DEFAULT NULL,
  `tracking_token` varchar(64) DEFAULT NULL,
  `account_id` int DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_company` (`batch_no`,`supplier_id`),
  KEY `idx_message` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── reco_supplier_opportunity ──
CREATE TABLE `reco_supplier_opportunity` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `supplier_table` varchar(32) NOT NULL DEFAULT 'supplier',
  `supplier_id` bigint unsigned NOT NULL DEFAULT '0',
  `opportunity_id` bigint unsigned NOT NULL DEFAULT '0',
  `match_score` decimal(5,2) NOT NULL DEFAULT '0.00',
  `match_level` varchar(20) NOT NULL DEFAULT 'low',
  `match_basis_code` varchar(32) DEFAULT NULL,
  `match_basis_level` tinyint unsigned NOT NULL DEFAULT '0',
  `match_basis_name` varchar(255) DEFAULT NULL,
  `match_path_text` varchar(1000) DEFAULT NULL,
  `matched_codes` json DEFAULT NULL COMMENT '匹配证据=供应商码∩商单码，[{code,word,conf,src,sup_words}]',
  `code_hit_l5` smallint unsigned NOT NULL DEFAULT '0',
  `best_supplier_conf` decimal(4,2) DEFAULT NULL,
  `keyword_hits` varchar(500) DEFAULT NULL,
  `reasons_json` text,
  `barrier_flags` varchar(200) DEFAULT NULL,
  `service_procurement` tinyint NOT NULL DEFAULT '0',
  `supplier_has_contact` tinyint(1) NOT NULL DEFAULT '0',
  `opportunity_deadline_days` int DEFAULT NULL,
  `contact_priority` tinyint NOT NULL DEFAULT '3',
  `status` varchar(20) NOT NULL DEFAULT 'new',
  `batch_no` varchar(32) NOT NULL DEFAULT '',
  `algo_version` varchar(32) NOT NULL DEFAULT 'v1',
  `evidence_snapshot` json DEFAULT NULL,
  `opportunity_title` varchar(500) DEFAULT NULL,
  `supplier_company` varchar(200) DEFAULT NULL,
  `is_expired` tinyint NOT NULL DEFAULT '0',
  `tenant_id` bigint NOT NULL DEFAULT '1',
  `last_generated_at` datetime DEFAULT NULL,
  `pushed_at` datetime DEFAULT NULL,
  `sales_feedback` varchar(20) DEFAULT NULL COMMENT 'relevant/irrelevant/wrong_contact/expired（后台看板写，导出不覆盖）',
  `feedback_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_opp` (`supplier_table`,`supplier_id`,`opportunity_id`),
  KEY `idx_batch` (`batch_no`),
  KEY `idx_opp_score` (`opportunity_id`,`match_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机×供应商推荐明细';

-- ── reco_weight_profile ──
CREATE TABLE `reco_weight_profile` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `w_commodity` decimal(5,3) NOT NULL DEFAULT '0.500',
  `w_agency` decimal(5,3) NOT NULL DEFAULT '0.150',
  `w_amount` decimal(5,3) NOT NULL DEFAULT '0.100',
  `w_geo` decimal(5,3) NOT NULL DEFAULT '0.100',
  `w_urgency` decimal(5,3) NOT NULL DEFAULT '0.150',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户个性化推荐权重档案表。';

-- ── refresh_tokens ──
CREATE TABLE `refresh_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '所属用户 ID（users.id）；用于按用户吊销全部会话',
  `token_hash` varchar(128) NOT NULL COMMENT 'Refresh Token 的 SHA-256 哈希（不存明文，泄露不可反推）',
  `expires_at` datetime NOT NULL COMMENT '过期时间（与 JWT 有效期对齐，7 天）；到期由周期任务清理',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签发时间（审计用）',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='前台哈希登记表';

-- ── rfq_guard ──
CREATE TABLE `rfq_guard` (
  `rfq_id` int NOT NULL COMMENT '平台RFQ在 bid_notices.id 的落位（本表主键；爬虫同步不触碰本表）',
  `reference` varchar(100) NOT NULL COMMENT 'OSRFQ-{id} 唯一编号快照，供对账定位',
  `user_id` int DEFAULT NULL COMMENT '创建者 user_id 快照，对账时校验主行归属未被改写',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
  PRIMARY KEY (`rfq_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='平台RFQ守护登记表：记录每条RFQ预期归属，对账检出被爬虫按主键改写/消失（跨系统契约哨兵）';

-- ── rfq_invites ──
CREATE TABLE `rfq_invites` (
  `rfq_id` int NOT NULL COMMENT '目标 RFQ 的 bid_notices.id 落位',
  `supplier_user_id` int unsigned NOT NULL COMMENT '被邀约供应商 user_id',
  `invited_by` int unsigned NOT NULL COMMENT '发起邀约的采购方 user_id',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rfq_id`,`supplier_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RFQ定向邀约名单：targeted RFQ 的报价资格白名单，public 不使用';

-- ── rfq_outreach ──
CREATE TABLE `rfq_outreach` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rfq_id` int NOT NULL COMMENT '平台RFQ在 bid_notices.id 的落位',
  `recipient` varchar(190) NOT NULL COMMENT '收件邮箱（匹配供应商或显式收件）',
  `supplier_user_id` int unsigned DEFAULT NULL COMMENT '若收件对应平台供应商账号则记录其 user_id，显式外部邮箱为 NULL',
  `contacted_at` int unsigned NOT NULL DEFAULT '0' COMMENT '首次触达时间（epoch 秒）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rfq_recipient` (`rfq_id`,`recipient`),
  KEY `idx_rfq` (`rfq_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RFQ发布邀约触达账本：记录已发邀约的收件，供发布触达去重';

-- ── rfq_quotes ──
CREATE TABLE `rfq_quotes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rfq_id` int NOT NULL COMMENT '所报 RFQ 的 bid_notices.id 落位',
  `supplier_user_id` int unsigned NOT NULL COMMENT '报价供应商 user_id（认证企业）',
  `price` decimal(20,2) NOT NULL COMMENT '报价金额',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `lead_time_days` int DEFAULT NULL COMMENT '交付周期（天）',
  `delivery_terms` varchar(200) DEFAULT NULL COMMENT '交付/商务条款',
  `note` varchar(1000) DEFAULT NULL COMMENT '报价说明',
  `status` varchar(16) NOT NULL DEFAULT 'submitted' COMMENT 'submitted/withdrawn/won/rejected',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rfq_supplier` (`rfq_id`,`supplier_user_id`),
  KEY `idx_quotes_rfq` (`rfq_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='RFQ密封报价表：认证供应商报价，选定以status表达，不动rfq_status/可搜口径';

-- ── rfx_country_map ──
CREATE TABLE `rfx_country_map` (
  `name_raw` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `alpha2` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name_zh` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name_en` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`name_raw`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── rfx_platform_map ──
CREATE TABLE `rfx_platform_map` (
  `platform_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name_zh` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name_en` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`platform_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── service_catalog ──
CREATE TABLE `service_catalog` (
  `service_code` varchar(64) NOT NULL COMMENT '服务稳定机器码',
  `category` enum('pro_service','advisory','api_license') NOT NULL COMMENT '服务类别：专业增值 / 顾问服务 / API 数据授权',
  `name_zh` varchar(120) NOT NULL,
  `name_en` varchar(120) NOT NULL COMMENT '官网英文名',
  `price_mode` enum('per_unit','per_time','per_year','token','project','quote','contact') NOT NULL COMMENT '计价形态：按单件/按次/按年包/按算力/按项目/单独报价/联系销售，驱动订单定价与展示后缀',
  `standard_price` decimal(10,2) DEFAULT NULL COMMENT '标准价；token/project/quote/contact 形态为 NULL（算力计费与另议不冒充价格）',
  `price_from` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=标准价是"起"价，前端展示必须带"起"字，防一口价误读',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `grant_benefit_code` varchar(64) DEFAULT NULL COMMENT '成交后向额度账本充值的权益码（FK benefit_catalog，须 is_consumable=1）；纯交付型为 NULL',
  `grant_quota` int DEFAULT NULL COMMENT '单次成交充值的额度数量，与 grant_benefit_code 成对出现',
  `grant_period` enum('none','monthly','yearly') NOT NULL DEFAULT 'none' COMMENT '所充额度的周期口径（年度包 12 次按年）',
  `validity_days` int DEFAULT NULL COMMENT '服务有效期/交付窗口天数；NULL=按合同约定',
  `sale_mode` enum('self','lead','contract') NOT NULL DEFAULT 'self' COMMENT '成交方式：自助下单 / 留资转化 / 合同成交（后两者不进自助支付）',
  `member_discount` enum('none','any_plan','unlimited_plus') NOT NULL DEFAULT 'none' COMMENT '会员优惠资格；具体折后价由定价服务层按档计算，本表不存折扣率',
  `deliverable_note_zh` varchar(500) DEFAULT NULL COMMENT '标准交付口径说明',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `credit_to_annual_plan` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=该服务成交单可在购买年付套餐时全额抵扣本单金额（文档「升级年包可全额抵扣」）；核销锚点=payment_orders.original_order_no 记本服务单号，一张服务单只核销一次',
  PRIMARY KEY (`service_code`),
  KEY `idx_cat_sort` (`category`,`is_active`,`sort_order`),
  KEY `fk_svc_grant_benefit` (`grant_benefit_code`),
  CONSTRAINT `fk_svc_grant_benefit` FOREIGN KEY (`grant_benefit_code`) REFERENCES `benefit_catalog` (`benefit_code`),
  CONSTRAINT `chk_grant_pair` CHECK (((`grant_benefit_code` is null) = (`grant_quota` is null))),
  CONSTRAINT `chk_grant_period` CHECK (((`grant_benefit_code` is null) or (`grant_period` <> _utf8mb4'none'))),
  CONSTRAINT `chk_price_by_mode` CHECK (((`price_mode` in (_utf8mb4'token',_utf8mb4'project',_utf8mb4'quote',_utf8mb4'contact')) or ((`standard_price` is not null) and (`standard_price` > 0)))),
  CONSTRAINT `chk_price_from` CHECK (((`price_from` = 0) or (`standard_price` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='增值服务目录表：非订阅制服务（按次/按项目/按合同购买）的品名、计价形态、标准价与成交后额度充值规则';

-- ── service_orders ──
CREATE TABLE `service_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(80) NOT NULL COMMENT '对外业务订单号，与支付域对账的唯一锚点',
  `user_id` bigint unsigned NOT NULL COMMENT '下单账号',
  `service_code` varchar(64) NOT NULL COMMENT 'FK service_catalog：买了哪个服务',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '购买数量（按件/按次；按年包恒 1）',
  `unit_price_snapshot` decimal(10,2) DEFAULT NULL COMMENT '成交单价快照；quote/contact 形态成交前为 NULL（表达流程阶段而非语义含糊）',
  `amount_total` decimal(10,2) NOT NULL COMMENT '订单总额 = 单价 × 数量，由服务层计算写入',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `status` varchar(20) NOT NULL COMMENT '订单状态；故意用 VARCHAR+CHECK 而非 ENUM：NOT NULL ENUM 无 DEFAULT 时 MySQL 隐式取首个枚举值，会静默把漏传当成合法状态',
  `sale_mode_snapshot` varchar(20) NOT NULL COMMENT '下单时目录销售形态快照（同上，不用 ENUM，强制显式传入）',
  `granted_subscription_id` bigint unsigned DEFAULT NULL COMMENT '额度充值落点订阅（软链不建外键，跨写入域解耦）；仅 paid 状态可挂',
  `contract_ref` varchar(120) DEFAULT NULL COMMENT '合同编号：价格文档"以合同为准"（成功费、专项报价、授权范围）的回查锚点',
  `paid_at` datetime DEFAULT NULL COMMENT '支付或成交时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_status` (`user_id`,`status`,`created_at`),
  KEY `idx_service` (`service_code`,`status`),
  CONSTRAINT `fk_ord_service__p3` FOREIGN KEY (`service_code`) REFERENCES `service_catalog` (`service_code`),
  CONSTRAINT `crm_service_orders_chk_1` CHECK (((`granted_subscription_id` is null) or (`status` = _utf8mb4'paid'))),
  CONSTRAINT `crm_service_orders_chk_2` CHECK ((`quantity` > 0)),
  CONSTRAINT `crm_service_orders_chk_3` CHECK ((`sale_mode_snapshot` in (_utf8mb4'self',_utf8mb4'lead',_utf8mb4'contract'))),
  CONSTRAINT `crm_service_orders_chk_4` CHECK ((`status` in (_utf8mb4'lead',_utf8mb4'pending',_utf8mb4'paid',_utf8mb4'cancelled',_utf8mb4'refunded')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='服务订购订单表：增值服务的下单与成交事实（数量、单价快照、状态机、合同编号、额度充值落点）；订阅类购买不走本表';

-- ── supplier_backbone_interests ──
CREATE TABLE `supplier_backbone_interests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_table` varchar(32) NOT NULL DEFAULT 'supplier',
  `supplier_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '供应商ID，对应供应商表ID',
  `code_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '旧字典ID，暂未绑定字典时为0',
  `code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '' COMMENT '品目编码（现为 UGT 节点码）',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '' COMMENT '品目名称或描述',
  `level` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '品目层级：1大类/2二级/3三级/4四级/5五级',
  `level1_id` varchar(32) NOT NULL DEFAULT '' COMMENT '一级分类编码前缀，通常为前2位',
  `level2_id` varchar(32) NOT NULL DEFAULT '' COMMENT '二级分类编码前缀，通常为前4位',
  `level3_id` varchar(32) NOT NULL DEFAULT '' COMMENT '三级分类编码前缀，通常为前6位',
  `level4_id` varchar(32) NOT NULL DEFAULT '' COMMENT '四级分类编码前缀，通常为前8位',
  `level5_id` varchar(32) NOT NULL DEFAULT '' COMMENT '五级分类编码前缀，若存在通常为前10位',
  `source` varchar(32) NOT NULL DEFAULT '' COMMENT '兴趣来源：register_level1/manual_filter/unlock_order/express_interest/ai_inferred等',
  `weight` decimal(10,2) NOT NULL DEFAULT '1.00' COMMENT '兴趣权重，推荐排序时使用',
  `confidence` decimal(5,2) NOT NULL DEFAULT '0.00',
  `evidence` varchar(500) DEFAULT NULL,
  `path_text` varchar(1000) DEFAULT NULL,
  `keyword_hits` varchar(500) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL COMMENT '创建时间',
  `updated_at` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_code_source` (`supplier_id`,`code`,`source`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_code` (`code`),
  KEY `idx_source` (`source`),
  KEY `idx_level1` (`level1_id`),
  KEY `idx_level2` (`level2_id`),
  KEY `idx_level3` (`level3_id`),
  KEY `idx_supplier_table_id` (`supplier_table`,`supplier_id`),
  KEY `idx_supplier_l5_fast` (`supplier_table`,`level5_id`,`supplier_id`),
  KEY `idx_supplier_l4_fast` (`supplier_table`,`level4_id`,`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商品目兴趣画像表，用于记录注册、筛选、解锁、表达兴趣和AI推断形成的行业偏好';

-- ── supplier_certifications ──
CREATE TABLE `supplier_certifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL COMMENT '认证名称',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商认证证书字典表';

-- ── supplier_claims ──
CREATE TABLE `supplier_claims` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '申请账号 users.id；补录未填邮箱时 NULL',
  `supplier_id` bigint unsigned DEFAULT NULL COMMENT '匹配/审核选定的库内供应商 supplier.id',
  `contact_name` varchar(100) DEFAULT NULL,
  `contact_phone` varchar(80) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/expired',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '驳回原因',
  `expires_at` datetime DEFAULT NULL COMMENT '临时绑定到期时间（7天），仅 pending 有意义',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_supplier` (`user_id`,`supplier_id`),
  KEY `idx_supplier_status` (`supplier_id`,`status`),
  KEY `idx_status_expires` (`status`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商认领表。';

-- ── supplier_diagnosis ──
CREATE TABLE `supplier_diagnosis` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '提交人（登录态写入，不允许为空）',
  `supplier_id` bigint unsigned NOT NULL COMMENT '诊断主体（supplier.id，命中即关联，未命中由服务端建档）',
  `company_name` varchar(255) NOT NULL COMMENT '主体名称快照（仅用于历史可读，不参与评分与编辑）',
  `english_evidence_level` varchar(40) NOT NULL COMMENT 'D2 可即时提供的英文投标资料程度',
  `english_meeting_capability` varchar(40) NOT NULL COMMENT 'D2 英文供应商答疑会与视频澄清会能力',
  `tender_experience` varchar(40) NOT NULL COMMENT 'D3 近24个月国际公共采购投标实际情况',
  `tender_amount_band` varchar(40) NOT NULL COMMENT 'D3 最近一次投标金额量级',
  `procurement_frameworks` varchar(255) NOT NULL COMMENT 'D3 熟悉的采购文件体系（逗号分隔多选）',
  `mandatory_docs` varchar(500) NOT NULL COMMENT 'D4 可即时提供的强制文件清单（逗号分隔多选）',
  `ungm_status` varchar(40) NOT NULL COMMENT 'D5 UNGM 注册状态',
  `compliance_governance` varchar(40) NOT NULL COMMENT 'D5 合规专岗与整改机制',
  `technical_response` varchar(40) NOT NULL COMMENT 'D6 按标书逐条技术响应与证明能力',
  `cost_pricing` varchar(40) NOT NULL COMMENT 'D7 报价成本核算方式',
  `incoterms_capability` varchar(40) NOT NULL COMMENT 'D7 多贸易条款报价能力',
  `payment_terms` varchar(40) NOT NULL COMMENT 'D7 是否接受30天以上国际账期',
  `export_scale` varchar(40) NOT NULL COMMENT 'D7 近2年出口与国际业务规模',
  `submission_control` varchar(40) NOT NULL COMMENT 'D8 标书提交前复核流程',
  `deliver_to_site` varchar(40) NOT NULL COMMENT 'D9 能否交付至项目现场国',
  `service_countries` text NOT NULL COMMENT 'D9 有售后点、服务站或维修点的国家清单',
  `overseas_companies` text NOT NULL COMMENT 'D9 有海外分公司投资公司的国家清单',
  `team_discipline` varchar(40) NOT NULL COMMENT 'D10 投标团队人数与台账纪律',
  `bid_willingness` varchar(10) NOT NULL COMMENT '投标意愿（仅线索标记，不参与任何维度计分）',
  `schema_version` tinyint unsigned NOT NULL DEFAULT '2' COMMENT '口径代次（2=本表首代，历史代次不互比不重算）',
  `score_total` decimal(4,1) DEFAULT NULL COMMENT '评分快照总分（满分100）',
  `score_grade` varchar(2) DEFAULT NULL COMMENT '评分快照等级 A/B/C',
  `score_breakdown` json DEFAULT NULL COMMENT '10 维度得分明细快照（含依据与人工补充标记）',
  `scored_at` datetime DEFAULT NULL COMMENT '快照生成时间',
  `ip` varchar(64) DEFAULT NULL COMMENT '提交IP（审计留痕）',
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次提交时间',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `report_ai` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_supplier` (`user_id`,`supplier_id`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_score` (`score_total`),
  KEY `idx_submitted` (`submitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商投标能力诊断表';

-- ── supplier_industry_rel ──
CREATE TABLE `supplier_industry_rel` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `supplier_id` bigint unsigned NOT NULL,
  `industry_code` varchar(40) NOT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'ai-calibration' COMMENT 'layer1|ai-calibration|review',
  `confidence` decimal(4,3) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup_code` (`supplier_id`,`industry_code`),
  KEY `idx_code` (`industry_code`),
  KEY `idx_sup` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商×行业面标签关系';

-- ── sync_watermark ──
CREATE TABLE `sync_watermark` (
  `table_name` varchar(64) NOT NULL,
  `id_wm` bigint unsigned NOT NULL DEFAULT '0',
  `time_wm` varchar(32) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── system_configs ──
CREATE TABLE `system_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `config_group` varchar(40) NOT NULL DEFAULT 'system',
  `config_key` varchar(100) NOT NULL,
  `config_value` text,
  `description` varchar(200) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_key` (`config_group`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='后台配置表';

-- ── taxonomy_intake ──
CREATE TABLE `taxonomy_intake` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_table` varchar(64) NOT NULL COMMENT '来源表',
  `source_pk` varchar(40) NOT NULL COMMENT '来源表主键',
  `notice_id` varchar(40) DEFAULT NULL,
  `code` varchar(20) NOT NULL COMMENT '未通过校验的品目码',
  `reason` varchar(200) NOT NULL COMMENT '拦截原因',
  `payload` json DEFAULT NULL COMMENT '原始行',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending|resolved|discarded',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_src` (`source_table`,`source_pk`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分类吸收队列(野码隔离)';

-- ── training_download_stats ──
CREATE TABLE `training_download_stats` (
  `material_id` varchar(60) NOT NULL,
  `file_name` varchar(120) NOT NULL DEFAULT '',
  `download_count` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资料下载次数统计';

-- ── training_registrations ──
CREATE TABLE `training_registrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL,
  `industry_id` int DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `main_product` varchar(255) DEFAULT NULL,
  `export_experience` varchar(255) DEFAULT NULL,
  `certification` text,
  `contact_name` varchar(100) NOT NULL,
  `position` varchar(100) DEFAULT NULL,
  `telephone` varchar(50) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `remark` text,
  `participants` json DEFAULT NULL COMMENT '学员名单 JSON',
  `participant_count` int NOT NULL DEFAULT '1' COMMENT '参训人数',
  `schedule_id` int unsigned DEFAULT NULL COMMENT '选择的期次 ID',
  `audit_status` varchar(30) NOT NULL DEFAULT 'pending',
  `payment_status` varchar(20) NOT NULL DEFAULT 'unpaid',
  `order_id` bigint unsigned DEFAULT NULL,
  `converted_supplier_id` bigint unsigned DEFAULT NULL,
  `portal_supplier_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_training_status` (`audit_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班报名表';

-- ── upload_files ──
CREATE TABLE `upload_files` (
  `filename` varchar(120) NOT NULL COMMENT '文件名（全局唯一，license_<uid>_<ts>.<ext>）',
  `content` longblob NOT NULL COMMENT '文件字节本体',
  `content_type` varchar(100) NOT NULL DEFAULT 'application/octet-stream',
  `size_bytes` int unsigned NOT NULL DEFAULT '0',
  `uploaded_by` int unsigned DEFAULT NULL COMMENT '上传者 user id（文件名内嵌 uid 的冗余，便于按人清理）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件上传表';

-- ── user_industry_prefs ──
CREATE TABLE `user_industry_prefs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `commodity_code` varchar(40) NOT NULL DEFAULT '' COMMENT '品目面码，可停在段/族/类/品目任一层；空=只订到大类',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_pref` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户行业偏好。';

-- ── user_interest_codes ──
CREATE TABLE `user_interest_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `code` varchar(24) NOT NULL,
  `level` tinyint NOT NULL,
  `source` varchar(40) NOT NULL,
  `weight` decimal(8,2) NOT NULL DEFAULT '1.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_code_source` (`user_id`,`code`,`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户关注的公告编码。';

-- ── user_llm_config ──
CREATE TABLE `user_llm_config` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `provider_name` varchar(100) NOT NULL DEFAULT 'Custom',
  `base_url` varchar(500) NOT NULL,
  `api_key` varchar(500) NOT NULL,
  `model` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_active` (`user_id`,`is_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户所绑定的API KEY';

-- ── user_notice_views ──
CREATE TABLE `user_notice_views` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned DEFAULT NULL,
  `viewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`,`viewed_at`),
  KEY `idx_notice_view` (`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户查看过的公告。';

-- ── user_reco_feedback ──
CREATE TABLE `user_reco_feedback` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned NOT NULL,
  `action` enum('impression','click','dwell','scroll_end','quick_exit','revisit') NOT NULL,
  `variant` varchar(20) DEFAULT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `dwell_ms` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dedup` (`user_id`,`notice_id`,`session_id`,`action`),
  KEY `idx_user_time` (`user_id`,`created_at`),
  KEY `idx_notice_action` (`notice_id`,`action`),
  KEY `idx_variant` (`variant`,`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户行为反馈埋点表。';

-- ── user_search_log ──
CREATE TABLE `user_search_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '发起搜索的登录用户，锚 users.id；匿名检索不记录',
  `q` varchar(200) DEFAULT NULL COMMENT '搜索关键词；NULL=未输入关键词(仅筛选检索)',
  `country` varchar(100) DEFAULT NULL COMMENT '国家筛选项',
  `filters` json DEFAULT NULL COMMENT '结构化筛选组合：code_id/deadline_from/deadline_to/deadline_within_days/notice_type/featured/sort/forced_level1_id',
  `result_cnt` int NOT NULL DEFAULT '0' COMMENT '本次检索返回结果总数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检索发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`,`created_at`),
  KEY `idx_zero_result` (`result_cnt`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告搜索行为日志。(仅登录用户)';

-- ── user_supplier_pool ──
CREATE TABLE `user_supplier_pool` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `supplier_id` bigint unsigned DEFAULT NULL COMMENT '关联 supplier 表',
  `source` varchar(20) NOT NULL DEFAULT 'manual' COMMENT '来源: platform/manual',
  `notes` text COMMENT '私有备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_supplier` (`user_id`,`supplier_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务员的供应商库。';

-- ── users ──
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '用户 ID（影子表重排后自 1 连续；业务身份锚点仍是 phone）',
  `email` varchar(190) DEFAULT NULL COMMENT '邮箱（注册不强制，可个人中心补绑；登录双轨之一）',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号（注册即登录账号，唯一）',
  `phone_verified` tinyint(1) NOT NULL DEFAULT '0' COMMENT '手机号是否已验证 0否/1是',
  `display_name` varchar(190) DEFAULT NULL COMMENT '真实姓名（注册填写；不进入任何对外 API 响应）',
  `nickname` varchar(100) DEFAULT NULL COMMENT '对外展示昵称',
  `password_hash` varchar(128) DEFAULT NULL COMMENT '密码哈希（不存明文）',
  `password_hash_type` varchar(20) NOT NULL DEFAULT 'sha256' COMMENT '哈希算法：bcrypt=新 / sha256=存量兼容（登录时可透明升级）',
  `account_status` varchar(30) NOT NULL DEFAULT 'pending' COMMENT '账号状态；disabled/rejected 登录与刷新均拒绝',
  `user_type` varchar(20) NOT NULL DEFAULT 'enterprise' COMMENT '用户类型 personal=个人 / enterprise=企业',
  `supplier_id` bigint unsigned DEFAULT NULL COMMENT '绑定的企业档案 ID（supplier.id）',
  `supplier_link_status` varchar(30) NOT NULL DEFAULT 'none' COMMENT '企业关联状态；verified 才随登录下发企业信息',
  `referral_code` varchar(20) DEFAULT NULL COMMENT '注册时填写的邀请码（拉新归因）',
  `referral_employee_id` int unsigned DEFAULT NULL COMMENT '邀请码对应员工 ID（employees.id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '资料最后修改时间',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0' COMMENT '邮箱是否已验证 0否/1是',
  `last_login_at` datetime DEFAULT NULL COMMENT '最近登录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_user_type` (`user_type`),
  KEY `idx_supplier_link` (`supplier_id`,`supplier_link_status`),
  KEY `idx_referral` (`referral_employee_id`,`referral_code`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_supplier_id` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户主表';

-- ── learning_orders ──
CREATE TABLE `learning_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `order_no` varchar(80) NOT NULL,
  `plan_code` varchar(60) NOT NULL COMMENT 'material_{id} 或 bundle_{id}',
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `provider` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `provider_trade_no` varchar(120) DEFAULT NULL,
  `pay_url` text,
  `qr_code_url` text,
  `raw_request` json DEFAULT NULL,
  `raw_notify` json DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `idx_lo_plan_code` (`plan_code`),
  KEY `idx_lo_user_id` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学习资料订单表';

-- ── link ──
CREATE TABLE `link` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '链接显示名称',
  `title` varchar(100) NOT NULL DEFAULT '' COMMENT '链接名称',
  `url` varchar(255) NOT NULL DEFAULT '' COMMENT '链接URL',
  `icon` varchar(50) NOT NULL DEFAULT '' COMMENT 'iconfont 图标 class 名',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序权重（越小越靠前）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=禁用',
  `thumb` varchar(255) NOT NULL DEFAULT '' COMMENT '缩略图',
  `sort` int NOT NULL DEFAULT '50' COMMENT '排序',
  `addtime` int NOT NULL DEFAULT '0' COMMENT '添加时间',
  `open` tinyint NOT NULL DEFAULT '0' COMMENT '0禁用1启用',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_link_status_sort` (`status`,`sort_order`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC;

-- ── refresh_token ──
CREATE TABLE `refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL COMMENT '用户ID',
  `user_type` varchar(20) NOT NULL DEFAULT 'account' COMMENT '用户类型',
  `token_hash` varchar(255) NOT NULL COMMENT 'Token SHA-256 哈希',
  `expiry_time` datetime NOT NULL COMMENT '过期时间',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/USED/REVOKED/EXPIRED',
  `rotated_at` datetime DEFAULT NULL COMMENT '轮换时间',
  `successor_hash` varchar(255) DEFAULT NULL COMMENT '后继 Token 哈希',
  `revoked_reason` varchar(100) DEFAULT NULL COMMENT '撤销原因',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_expiry_time` (`expiry_time`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='后台刷新令牌表';

-- ── schema_migrations ──
CREATE TABLE `schema_migrations` (
  `version` int unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── suppiler_cloud ──
CREATE TABLE `suppiler_cloud` (
  `id` int NOT NULL,
  `country` varchar(32) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `credit_code` char(18) DEFAULT NULL,
  `registration_status` varchar(64) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `main_products` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `region` varchar(128) DEFAULT NULL,
  `contact_person` varchar(64) DEFAULT NULL,
  `contact_title` varchar(64) DEFAULT NULL,
  `contact_phone` varchar(128) DEFAULT NULL,
  `email` varchar(128) DEFAULT NULL,
  `address` varchar(512) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_company` (`company_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='内网供应商净数据源(只读,供补全)';

-- ── supplier ──
CREATE TABLE `supplier` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `company` varchar(200) NOT NULL DEFAULT '' COMMENT '公司名称',
  `country` varchar(100) NOT NULL DEFAULT '' COMMENT '国家/地区',
  `country_code` varchar(5) DEFAULT '' COMMENT '国家ISO代码',
  `province` varchar(50) DEFAULT NULL COMMENT '省份（国内供应商）',
  `city` varchar(50) DEFAULT NULL COMMENT '城市（国内供应商）',
  `contact` varchar(100) NOT NULL DEFAULT '' COMMENT '联系人',
  `position` varchar(100) DEFAULT '' COMMENT '职位',
  `phone` varchar(60) NOT NULL DEFAULT '' COMMENT '联系电话',
  `email` varchar(150) NOT NULL DEFAULT '' COMMENT '邮箱',
  `address` varchar(500) DEFAULT '' COMMENT '地址',
  `website` varchar(255) NOT NULL DEFAULT '' COMMENT '官网',
  `industry_code` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '主行业码 UGT-I-*（V3 直标）',
  `certification` varchar(500) DEFAULT NULL,
  `products` varchar(500) DEFAULT '' COMMENT '主营产品',
  `business_type` varchar(50) DEFAULT NULL COMMENT '供应商业务身份，如制造商/贸易公司/认证供应商',
  `coop_status` tinyint NOT NULL DEFAULT '2' COMMENT '0=已停止 1=合作中 2=待评估',
  `remark` text COMMENT '备注',
  `source_channel` varchar(80) DEFAULT NULL COMMENT '供应商来源渠道，如OS报名/Google Maps/Alibaba/LinkedIn/官网采集',
  `source_url` varchar(500) DEFAULT NULL COMMENT '供应商来源页面URL，可追溯采集来源',
  `addtime` int NOT NULL DEFAULT '0' COMMENT '添加时间戳',
  `legal_rep` varchar(50) DEFAULT NULL,
  `intro` text,
  `business_scope` text COMMENT '经营范围（来源：supplier_merged 清洗合并）',
  `registered_address` varchar(255) DEFAULT NULL,
  `registered_phone` varchar(40) DEFAULT NULL,
  `registered_email` varchar(120) DEFAULT NULL,
  `established_at` date DEFAULT NULL COMMENT '成立日期',
  `registered_capital` decimal(16,2) DEFAULT NULL COMMENT '注册资本',
  `credit_code` varchar(30) DEFAULT NULL,
  `info_checked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否核对过(公司中文名+联系方式)',
  `check_note` varchar(500) DEFAULT NULL COMMENT '核对信息表述',
  `info_check` text COMMENT '核对结果JSON: {"中文名一致":"未核对|核对通过|已经纠正|查无此公司","电话一致":"未核对|核对通过|已经纠正|对不上","邮箱一致":"..."}',
  `verify_status` varchar(20) DEFAULT NULL COMMENT 'NULL待处理/processing认领中/done完成',
  `license_url` varchar(500) DEFAULT NULL COMMENT '营业执照图片URL',
  `claim_status` varchar(20) DEFAULT NULL COMMENT '认领状态: NULL=可认领, pending=临时绑定待完善, verified=已认证',
  `enrich_suggested` json DEFAULT NULL COMMENT 'AI补全建议值(JSON)',
  `enrich_status` varchar(20) DEFAULT NULL COMMENT 'AI补全状态: pending_review/applied/rejected',
  `business_type_code` enum('manufacturer','trader','service_provider','other') DEFAULT NULL COMMENT '业务身份枚举：business_type 文本的结构化派生，人工编辑/补全应用时同步',
  `certification_tags` json DEFAULT NULL COMMENT '认证规范标签数组：certification 文本解析派生，如 ["ISO9001","CE"]',
  `data_quality_score` decimal(5,2) GENERATED ALWAYS AS (round((((((((((((((((((((((`country` is not null) and (trim(`country`) <> _utf8mb4'')) + ((`province` is not null) and (trim(`province`) <> _utf8mb4''))) + ((`city` is not null) and (trim(`city`) <> _utf8mb4''))) + ((`address` is not null) and (trim(`address`) <> _utf8mb4''))) + ((`contact` is not null) and (trim(`contact`) <> _utf8mb4''))) + ((`position` is not null) and (trim(`position`) <> _utf8mb4''))) + ((`phone` is not null) and (trim(`phone`) <> _utf8mb4''))) + ((`email` is not null) and (trim(`email`) <> _utf8mb4''))) + ((`website` is not null) and (trim(`website`) <> _utf8mb4''))) + ((`industry_code` is not null) and (trim(`industry_code`) <> _utf8mb4''))) + ((`products` is not null) and (trim(`products`) <> _utf8mb4''))) + ((`business_type` is not null) and (trim(`business_type`) <> _utf8mb4''))) + ((`certification` is not null) and (trim(`certification`) <> _utf8mb4''))) + ((`established_at` is not null) and (trim(`established_at`) <> _utf8mb4''))) + ((`registered_capital` is not null) and (trim(`registered_capital`) <> _utf8mb4''))) + ((`credit_code` is not null) and (trim(`credit_code`) <> _utf8mb4''))) + ((`legal_rep` is not null) and (trim(`legal_rep`) <> _utf8mb4''))) + ((`intro` is not null) and (trim(`intro`) <> _utf8mb4''))) + ((`registered_address` is not null) and (trim(`registered_address`) <> _utf8mb4''))) * 5.0),2)) STORED NOT NULL COMMENT '资料完整度。',
  PRIMARY KEY (`id`),
  KEY `idx_verify_status` (`verify_status`,`id`),
  KEY `idx_claim_status` (`claim_status`),
  KEY `idx_btype_code` (`business_type_code`),
  KEY `idx_coop_status` (`coop_status`,`id`),
  KEY `idx_credit_code` (`credit_code`),
  KEY `idx_company` (`company`(64)),
  FULLTEXT KEY `ft_supplier_products` (`products`) /*!50100 WITH PARSER `ngram` */ 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商管理';

-- ── sys_audit_logs ──
CREATE TABLE `sys_audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `operator_id` bigint unsigned NOT NULL COMMENT '操作人ID',
  `operator_name` varchar(100) NOT NULL COMMENT '操作人姓名',
  `dept_code` varchar(50) NOT NULL COMMENT '所属部门代码',
  `ip` varchar(45) NOT NULL COMMENT '客户端IP',
  `action_type` varchar(50) NOT NULL COMMENT '操作类型',
  `resource_type` varchar(50) NOT NULL COMMENT '资源类型',
  `resource_id` varchar(100) NOT NULL COMMENT '资源ID',
  `resource_name` varchar(300) DEFAULT NULL COMMENT '资源名称',
  `before_data` json DEFAULT NULL COMMENT '修改前数据（脱敏）',
  `after_data` json DEFAULT NULL COMMENT '修改后数据（脱敏）',
  `response_data` json DEFAULT NULL COMMENT '操作结果（接口响应data，脱敏截断）',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  `request_id` varchar(128) DEFAULT NULL COMMENT '请求追踪标识',
  PRIMARY KEY (`id`),
  KEY `idx_operator` (`operator_id`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审计日志表';

-- ── sys_menu ──
CREATE TABLE `sys_menu` (
  `menu_id` int unsigned NOT NULL AUTO_INCREMENT,
  `menu_key` varchar(60) NOT NULL COMMENT '唯一键：M/C=路由name，F=权限码',
  `menu_name` varchar(60) NOT NULL,
  `parent_id` int unsigned NOT NULL DEFAULT '0',
  `menu_type` char(1) NOT NULL COMMENT 'M目录 C菜单 F按钮',
  `perms` varchar(100) DEFAULT NULL COMMENT '按钮权限码',
  `order_num` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `visible` tinyint NOT NULL DEFAULT '1' COMMENT '是否可见',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `path` varchar(255) DEFAULT NULL COMMENT 'è·¯ç”±è·¯å¾„',
  `component` varchar(255) DEFAULT NULL COMMENT 'ç»„ä»¶è·¯å¾„',
  `icon` varchar(50) DEFAULT NULL COMMENT 'å›¾æ ‡',
  `remark` varchar(200) DEFAULT NULL COMMENT 'å¤‡æ³¨',
  PRIMARY KEY (`menu_id`),
  UNIQUE KEY `menu_key` (`menu_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── sys_migration ──
CREATE TABLE `sys_migration` (
  `name` varchar(60) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── sys_role ──
CREATE TABLE `sys_role` (
  `role_id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_key` varchar(30) NOT NULL COMMENT '内置角色=部门代码；自定义角色自拟',
  `role_name` varchar(60) NOT NULL,
  `remark` varchar(200) DEFAULT NULL,
  `built_in` tinyint(1) NOT NULL DEFAULT '0' COMMENT '内置部门角色不可删除',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` varchar(255) DEFAULT NULL COMMENT '描述',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `create_by` bigint DEFAULT NULL COMMENT '创建人',
  `update_by` bigint DEFAULT NULL COMMENT '更新人',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── sys_role_menu ──
CREATE TABLE `sys_role_menu` (
  `role_id` int unsigned NOT NULL,
  `menu_id` int unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── system ──
CREATE TABLE `system` (
  `id` int unsigned NOT NULL,
  `name` char(36) NOT NULL DEFAULT '' COMMENT '网站名称',
  `domain` varchar(36) NOT NULL DEFAULT '' COMMENT '网址',
  `title` varchar(200) NOT NULL COMMENT '标题',
  `key` varchar(200) NOT NULL COMMENT '关键字',
  `des` varchar(200) NOT NULL COMMENT '描述',
  `bah` varchar(50) DEFAULT NULL COMMENT '备案号',
  `copyright` varchar(30) DEFAULT NULL COMMENT 'copyright',
  `ads` varchar(120) DEFAULT NULL COMMENT '公司地址',
  `tel` varchar(15) DEFAULT NULL COMMENT '公司电话',
  `email` varchar(50) DEFAULT NULL COMMENT '公司邮箱',
  `logo` varchar(120) DEFAULT NULL COMMENT 'logo',
  `mobile` varchar(10) DEFAULT 'open' COMMENT '是否开启手机端 open 开启 close 关闭',
  `code` varchar(10) DEFAULT 'close' COMMENT '是否开启验证码',
  `custlimit` int DEFAULT NULL COMMENT '客户获取数量最大值',
  `autoday` int DEFAULT NULL COMMENT '自动转入公海时间设置天',
  `maxgetnum` int DEFAULT NULL COMMENT '员工月抢客户次数上限',
  `ai_config` json DEFAULT NULL COMMENT 'AI配置JSON数据',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='备案号';

-- ── training_courses ──
CREATE TABLE `training_courses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name_zh` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name_en` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `description_zh` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `description_en` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `unit_price` decimal(10,2) NOT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'CNY',
  `includes` json DEFAULT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'active',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_training_courses_status` (`status`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── training_orders ──
CREATE TABLE `training_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `order_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `course_id` int unsigned NOT NULL,
  `schedule_id` int unsigned DEFAULT NULL,
  `registration_id` bigint unsigned DEFAULT NULL,
  `participant_count` int NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'CNY',
  `provider` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'pending',
  `qr_code` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `pay_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `provider_trade_no` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `contact_name` varchar(100) DEFAULT NULL COMMENT '联系人姓名',
  `telephone` varchar(50) DEFAULT NULL COMMENT '联系电话',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `idx_training_orders_status` (`status`),
  KEY `idx_training_orders_registration` (`registration_id`),
  KEY `idx_to_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班订单。';

-- ── training_participants ──
CREATE TABLE `training_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL COMMENT '关联 training_orders.id',
  `participant_no` int unsigned NOT NULL COMMENT '学员序号（1-based，用于排序）',
  `full_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '学员姓名',
  `gender` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '性别（male/female/other）',
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '电话',
  `company_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '公司名称',
  `position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '职位',
  `email` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '邮箱',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_participants_order` (`order_id`,`participant_no`),
  KEY `idx_participants_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班报名的学员信息';

-- ── training_schedules ──
CREATE TABLE `training_schedules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `course_id` int unsigned NOT NULL,
  `period_number` int NOT NULL,
  `start_date` date NOT NULL,
  `city` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '杭州',
  `format` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '线下',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'coming_soon',
  `capacity` int DEFAULT NULL,
  `enrolled_count` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_training_schedules_course` (`course_id`,`start_date`),
  CONSTRAINT `fk_training_schedules_course` FOREIGN KEY (`course_id`) REFERENCES `training_courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='研修班课程规划';

-- ── ungm_1v1_appointments ──
CREATE TABLE `ungm_1v1_appointments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `appointment_key` varchar(190) NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `country` varchar(120) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `contact_person` varchar(190) NOT NULL,
  `contact_method` varchar(190) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `industry` varchar(190) DEFAULT NULL,
  `consultation_needs` text,
  `status` varchar(30) NOT NULL DEFAULT 'new',
  `follow_up_logs` json DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `raw_payload` json DEFAULT NULL,
  `ip` varchar(80) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appointment_key` (`appointment_key`),
  KEY `idx_ungm_1v1_status_created` (`status`,`created_at`),
  KEY `idx_ungm_1v1_contact_method` (`contact_method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约专业服务顾问';

-- 买家实体：同一采购机构的所有别名归到一个 buyer_id
CREATE TABLE `buyer` (
  `buyer_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `entity_key` char(64) NOT NULL COMMENT '国家+规范名哈希，去重键',
  `canonical_name` varchar(500) NOT NULL COMMENT '规范买家名',
  `country_code` char(2) DEFAULT NULL COMMENT '买家国家 ISO2',
  `buyer_group` varchar(100) DEFAULT NULL COMMENT '机构类型分类键',
  `name_zh` varchar(500) DEFAULT NULL COMMENT '中文规范名',
  `parent_buyer_id` bigint unsigned DEFAULT NULL COMMENT '上级机构（如下属医院/部门）',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`buyer_id`),
  UNIQUE KEY `uk_buyer_entity_key` (`entity_key`),
  KEY `idx_buyer_country` (`country_code`),
  KEY `idx_buyer_name` (`canonical_name`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='买家实体主数据';

-- 买家别名：原始写法 → buyer_id
CREATE TABLE `buyer_alias` (
  `alias_key` char(64) NOT NULL COMMENT '国家+原文买家名哈希',
  `buyer_id` bigint unsigned NOT NULL,
  `alias` varchar(500) NOT NULL COMMENT '原始买家名',
  `country_code` char(2) DEFAULT NULL,
  `source` varchar(50) NOT NULL DEFAULT 'notice',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`alias_key`),
  KEY `idx_buyer_alias_buyer` (`buyer_id`),
  KEY `idx_buyer_alias_name` (`alias`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='买家实体别名';

-- 买家中文翻译字典：按唯一 buyer_key 翻译，公告只引用，不逐条翻译
CREATE TABLE `buyer_translation` (
  `buyer_key` varchar(255) NOT NULL COMMENT 'normalizeAliasKey(buyer_name)',
  `buyer_name` varchar(500) NOT NULL COMMENT '规范买家名（原文）',
  `buyer_name_zh` varchar(500) DEFAULT NULL COMMENT '中文买家名',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/translated/reviewed/failed',
  `source_hash` char(64) DEFAULT NULL COMMENT '原文哈希，变化后重译',
  `translated_at` bigint DEFAULT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`buyer_key`),
  KEY `idx_buyer_translation_status` (`status`),
  KEY `idx_buyer_translation_name` (`buyer_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='买家中文翻译字典';

SET FOREIGN_KEY_CHECKS = 1;

