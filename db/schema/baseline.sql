-- db/schema/baseline.sql —— 全库结构基线（E2E 建表唯一来源，CI e2e job 按文件名序导入）
--
-- 生成方式：node --env-file=.env scripts/tools/dump-schema-baseline.mjs
-- 生成口径：仅 BASE TABLE，按表名升序，排除影子/备份表，剔除 AUTO_INCREMENT 计数。
--           源库共 100 张，导出 99 张，排除 1 张。
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
  `employee_id` int unsigned DEFAULT NULL COMMENT '关联 crm_employees.id',
  `dept_code` varchar(20) DEFAULT NULL COMMENT '管理部门（非员工账号使用；员工账号实时取 crm_employees.dept_code）',
  `role_id` int unsigned DEFAULT NULL COMMENT '指定角色（覆盖部门默认角色）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `employee_id` (`employee_id`),
  CONSTRAINT `fk_cmd_account_employee` FOREIGN KEY (`employee_id`) REFERENCES `crm_employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OS后台用户表';

-- ── crm_agency_aliases ──
CREATE TABLE `crm_agency_aliases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `canonical` varchar(255) NOT NULL COMMENT '标准机构名（展示用）',
  `alias` varchar(255) NOT NULL COMMENT '别名（匹配用，大写存储）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name_i18n` json DEFAULT NULL COMMENT '机构名多语言翻译 {zh, fr, ru, es, ar}',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alias` (`alias`),
  KEY `idx_canonical` (`canonical`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_api_keys ──
CREATE TABLE `crm_api_keys` (
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

-- ── crm_api_usage ──
CREATE TABLE `crm_api_usage` (
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

-- ── crm_appointments ──
CREATE TABLE `crm_appointments` (
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

-- ── crm_benefit_catalog ──
CREATE TABLE `crm_benefit_catalog` (
  `benefit_code` varchar(64) NOT NULL COMMENT '权益稳定机器码，上线后不可改语义（如 notice_view）',
  `name_zh` varchar(120) NOT NULL COMMENT '权益中文名，官网矩阵行名与卡片 chip 文案唯一来源',
  `value_kind` enum('bool','enum','quota') NOT NULL COMMENT '取值类型，决定 crm_plan_benefits 哪个值列有值：bool/enum→value_level，quota→value_num',
  `level_dict` json DEFAULT NULL COMMENT '枚举行各层级业务含义（值=价格文档单元格原文），非枚举行恒为 NULL',
  `sort_order` int NOT NULL COMMENT '矩阵行全局唯一展示顺序；官网行序与价格体系文档 02 章一致',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`benefit_code`),
  UNIQUE KEY `uk_benefit_sort` (`sort_order`),
  CONSTRAINT `chk_enum_dict_v2` CHECK (((`value_kind` <> _utf8mb4'enum') or (`level_dict` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权益目录表。';

-- ── crm_benefit_quotas ──
CREATE TABLE `crm_benefit_quotas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `subscription_id` bigint unsigned DEFAULT NULL COMMENT 'FK crm_plan_subscriptions：额度随订阅生灭；NULL=普通用户池（免费档计量权益）',
  `subscription_pool_key` bigint GENERATED ALWAYS AS (ifnull(`subscription_id`,0)) STORED COMMENT '生成列：把普通用户池的 NULL 归一为 0，使其可参与唯一约束',
  `user_id` bigint unsigned NOT NULL COMMENT '额度持有用户：订阅池记主账号，普通用户池记本人',
  `benefit_code` varchar(64) NOT NULL COMMENT 'FK crm_benefit_catalog：本池计量哪种权益（计量型判据唯一为 value_kind=quota）',
  `quota_total` int NOT NULL COMMENT '总额度；-1=不限（不限行不记消耗）',
  `quota_used` int NOT NULL DEFAULT '0' COMMENT '已用量；quota_total=-1 时恒为 0',
  `period_starts_at` datetime NOT NULL COMMENT '池的发放代次起点=幂等锚点：订阅池取该订阅 started_at、普通用户池取 1970-01-01 终身哨兵；故意不给默认值——本列参与 uk_pool，写行级时间戳会让同池重发另开一行满额池',
  `status` enum('active','exhausted','frozen') NOT NULL DEFAULT 'active' COMMENT '仅 active 可扣减；扣满置 exhausted、退款/升级承接置 frozen；订阅过期由 crm_plan_subscriptions 表达，本表不设 expired',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pool` (`subscription_pool_key`,`user_id`,`benefit_code`,`period_starts_at`),
  KEY `idx_subscription` (`subscription_id`,`status`),
  KEY `fk_quota_benefit` (`benefit_code`),
  CONSTRAINT `fk_quota_benefit` FOREIGN KEY (`benefit_code`) REFERENCES `crm_benefit_catalog` (`benefit_code`),
  CONSTRAINT `fk_quota_sub` FOREIGN KEY (`subscription_id`) REFERENCES `crm_plan_subscriptions` (`id`),
  CONSTRAINT `chk_usage` CHECK ((`quota_used` between 0 and greatest(`quota_total`,0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权益额度账本表。';

-- ── crm_bid_award_winners ──
CREATE TABLE `crm_bid_award_winners` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `award_id` bigint unsigned NOT NULL COMMENT '关联 crm_bid_awards.id',
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
  CONSTRAINT `fk_award_winners_award` FOREIGN KEY (`award_id`) REFERENCES `crm_bid_awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='中标商信息表';

-- ── crm_bid_awards ──
CREATE TABLE `crm_bid_awards` (
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
  `unspsc_code` varchar(20) DEFAULT NULL COMMENT 'UNSPSC 编码',
  `industry` varchar(100) DEFAULT NULL COMMENT '行业分类',
  `source_notice_id` varchar(100) DEFAULT NULL COMMENT '关联的 crm_bid_notices.notice_id（如可匹配）',
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

-- ── crm_bid_notice_unspsc_codes ──
CREATE TABLE `crm_bid_notice_unspsc_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `notice_id` varchar(100) NOT NULL COMMENT '公告ID',
  `code_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'UNSPSC字典ID，暂未绑定字典时为0',
  `code` varchar(32) NOT NULL DEFAULT '' COMMENT 'UNSPSC编码，如43211503',
  `level` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '该码在旧字典的层级。实测取值 2~7 且无 1（6/7 为异常深层节点）：筛选此类节点时 levelN_id 无对应列，退化为 code_id 兜底；相似公告按本列选择匹配层级。',
  `level1_id` int DEFAULT NULL COMMENT '旧字典 crm_unspsc_codes 的节点 id；本行处于该层级时填自身，否则为 NULL。入库由 crawler-sync 归一保证。',
  `level2_id` int DEFAULT NULL COMMENT '旧字典 crm_unspsc_codes 的节点 id；本行处于该层级时填自身，否则为 NULL。入库由 crawler-sync 归一保证。',
  `level3_id` int DEFAULT NULL COMMENT '旧字典 crm_unspsc_codes 的节点 id；本行处于该层级时填自身，否则为 NULL。入库由 crawler-sync 归一保证。',
  `level4_id` int DEFAULT NULL COMMENT '旧字典 crm_unspsc_codes 的节点 id；本行处于该层级时填自身，否则为 NULL。入库由 crawler-sync 归一保证。',
  `level5_id` int DEFAULT NULL COMMENT '旧字典 crm_unspsc_codes 的节点 id；本行处于该层级时填自身，否则为 NULL。入库由 crawler-sync 归一保证。',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notice_code` (`notice_id`,`code`),
  KEY `idx_notice_level1_notice` (`level1_id`,`notice_id`),
  KEY `idx_notice_level2_notice` (`level2_id`,`notice_id`),
  KEY `idx_notice_level3_notice` (`level3_id`,`notice_id`),
  KEY `idx_notice_level4_notice` (`level4_id`,`notice_id`),
  KEY `idx_notice_level5_notice` (`level5_id`,`notice_id`),
  KEY `idx_notice_code_notice` (`code`,`notice_id`),
  KEY `idx_notice_id` (`notice_id`),
  KEY `idx_level1_id` (`level1_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='招标公告分类桥表';

-- ── crm_bid_notices ──
CREATE TABLE `crm_bid_notices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `notice_id` varchar(100) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL COMMENT 'reference no',
  `title` varchar(500) DEFAULT NULL,
  `notice_type` varchar(500) DEFAULT NULL,
  `agency` varchar(255) DEFAULT NULL,
  `country` varchar(500) DEFAULT NULL,
  `deadline` varchar(50) DEFAULT NULL,
  `deadline_ts` bigint DEFAULT NULL,
  `days_left` int DEFAULT NULL COMMENT '剩余天数',
  `url` varchar(512) DEFAULT NULL,
  `description` longtext,
  `contacts` json DEFAULT NULL,
  `thresholds` json DEFAULT NULL,
  `external_links` json DEFAULT NULL,
  `procurement_files` json DEFAULT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `is_expired` bigint DEFAULT NULL,
  `is_converted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已转商机：0否1是',
  `converted_opp_id` bigint DEFAULT NULL,
  `create_time` bigint DEFAULT NULL,
  `update_time` bigint DEFAULT NULL,
  `ai_products` json DEFAULT NULL COMMENT 'AI解析的产品规格清单',
  `documents` json DEFAULT NULL COMMENT 'UNGM内部文档链接',
  `unspsc_codes` json DEFAULT NULL COMMENT 'UNSPSC国际采购分类代码',
  `difficulty` varchar(50) DEFAULT NULL COMMENT '门槛评级：简单/中等/较高/严格',
  `registration_level` varchar(100) DEFAULT NULL,
  `agency_full` varchar(500) DEFAULT NULL,
  `estimated_value` varchar(200) DEFAULT NULL COMMENT '预算/金额提取',
  `currency` varchar(10) DEFAULT 'CNY' COMMENT 'RFQ预算币种',
  `published_date` varchar(50) DEFAULT NULL COMMENT '发布日期',
  `rfq_status` varchar(20) DEFAULT NULL COMMENT 'RFQ状态: draft, published, closed',
  `rfq_reject_reason` varchar(500) DEFAULT NULL COMMENT 'RFQ审核驳回原因（后台填写）',
  `beneficiary_countries` varchar(500) DEFAULT NULL COMMENT '受益国家',
  `tenant_id` int NOT NULL DEFAULT '1' COMMENT '租户ID',
  `organization` varchar(500) DEFAULT NULL,
  `key_contacts` varchar(255) DEFAULT NULL,
  `is_qualified` tinyint(1) DEFAULT '0' COMMENT '公告是否被审核为合格（由商机审核同步）',
  `deadline_sec` bigint GENERATED ALWAYS AS (if((`deadline_ts` > 100000000000),floor((`deadline_ts` / 1000)),`deadline_ts`)) STORED,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `publisher_user_id` bigint unsigned DEFAULT NULL COMMENT 'RFQ发布人 user_id（爬虫数据为 NULL）',
  `purchase_type` varchar(16) DEFAULT NULL COMMENT '采购类型: once=单次, framework=框架, longterm=长期',
  `budget_confidential` tinyint(1) DEFAULT '0' COMMENT '预算是否保密（1=前端显示"预算保密"）',
  `budget_currency` varchar(8) DEFAULT 'USD' COMMENT '预算币种',
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
  `response_count` int unsigned DEFAULT '0' COMMENT '供应商响应数（仅 RFQ 来源使用）',
  `entry_source` varchar(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源: crawl, platform, api',
  `province_name` varchar(50) DEFAULT NULL COMMENT '交付省份（RFQ国内用）',
  `category_l1_id` int unsigned DEFAULT NULL COMMENT 'UNSPSC一级分类ID（RFQ用）',
  `category_l2_id` int unsigned DEFAULT NULL COMMENT 'UNSPSC二级分类ID（RFQ用）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_source` (`notice_id`),
  KEY `idx_agency` (`agency`),
  KEY `idx_notice_type` (`notice_type`),
  KEY `idx_bid_notices_converted_create_id` (`is_converted`,`create_time`,`id`),
  KEY `idx_deadline_sec` (`deadline_sec`),
  KEY `idx_bid_notices_featured` (`is_featured`),
  KEY `idx_bid_notices_country` (`country`),
  KEY `idx_notices_filter` (`country`(100),`agency`(100),`notice_type`(50)),
  KEY `idx_notices_reference` (`reference`(200),`is_active`),
  KEY `idx_bid_notices_converted_opp` (`is_converted`,`converted_opp_id`),
  KEY `idx_entry_source` (`entry_source`,`notice_type`),
  KEY `idx_bid_notices_user_id` (`user_id`),
  KEY `idx_create_time` (`create_time`),
  FULLTEXT KEY `ft_notices_search` (`title`,`reference`,`description`) /*!50100 WITH PARSER `ngram` */ ,
  FULLTEXT KEY `ft_notices_en` (`title`,`reference`),
  FULLTEXT KEY `ft_notices_desc` (`description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='招标公告表。';

-- ── crm_bid_opp_item_codes ──
CREATE TABLE `crm_bid_opp_item_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote` varchar(255) NOT NULL,
  `quote_hash` char(32) NOT NULL COMMENT 'md5(quote.strip())，关联 structured.items 条目',
  `opportunity_sample` int DEFAULT NULL,
  `word` varchar(128) DEFAULT NULL,
  `word_hash` char(32) DEFAULT NULL,
  `en_core` varchar(128) DEFAULT NULL,
  `zh_term` varchar(128) DEFAULT NULL,
  `code` varchar(16) DEFAULT NULL,
  `level` int DEFAULT NULL,
  `confidence` float DEFAULT NULL,
  `source` varchar(32) DEFAULT NULL,
  `variant` varchar(8) DEFAULT NULL,
  `status` varchar(16) DEFAULT 'ok',
  `mapped_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qw` (`quote_hash`,`word_hash`),
  KEY `idx_quote_hash` (`quote_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商单条目级 UNSPSC 编码（源=内网爬虫库）';

-- ── crm_bid_opp_structured ──
CREATE TABLE `crm_bid_opp_structured` (
  `opportunity_id` bigint unsigned NOT NULL,
  `title` varchar(500) DEFAULT NULL,
  `country` varchar(200) DEFAULT NULL,
  `delivery_place` varchar(300) DEFAULT NULL,
  `items` json DEFAULT NULL COMMENT '结构化采购条目数组 [{quote,qty,unit}]',
  `requirements` json DEFAULT NULL,
  `source_field` varchar(20) NOT NULL DEFAULT 'description',
  `source_hash` char(64) NOT NULL DEFAULT '',
  `extract_model` varchar(64) DEFAULT NULL,
  `rule_coverage` varchar(20) NOT NULL DEFAULT '',
  `validation` json DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'extracted',
  `extracted_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`opportunity_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商单 LLM+规则结构化抽取（源=内网爬虫库）';

-- ── crm_bid_opportunities ──
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标商机管理';

-- ── crm_bid_opportunity_unspsc_candidates ──
CREATE TABLE `crm_bid_opportunity_unspsc_candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `opportunity_id` bigint unsigned NOT NULL DEFAULT '0',
  `extract_id` bigint unsigned NOT NULL DEFAULT '0',
  `item_id` bigint unsigned NOT NULL DEFAULT '0',
  `item_no` int unsigned NOT NULL DEFAULT '0',
  `candidate_code` varchar(32) NOT NULL DEFAULT '',
  `candidate_name` varchar(255) NOT NULL DEFAULT '',
  `confidence` decimal(5,2) NOT NULL DEFAULT '0.00',
  `source` varchar(32) NOT NULL DEFAULT '',
  `reason` varchar(500) NOT NULL DEFAULT '',
  `evidence_text` text,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `is_primary` tinyint unsigned NOT NULL DEFAULT '0',
  `review_user_id` bigint unsigned NOT NULL DEFAULT '0',
  `review_time` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_conf` (`status`,`confidence`),
  KEY `idx_opp` (`opportunity_id`),
  KEY `idx_status_opp_code_fast` (`status`,`opportunity_id`,`candidate_code`),
  KEY `uk_item_code` (`opportunity_id`,`item_no`,`candidate_code`),
  KEY `idx_item_status` (`item_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='qualified opportunity UNSPSC level5 candidates';

-- ── crm_bid_opportunity_unspsc_codes ──
CREATE TABLE `crm_bid_opportunity_unspsc_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `opportunity_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '投标商机ID，对应crm_bid_opportunities.id',
  `code_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'UNSPSC字典ID，暂未绑定字典时为0',
  `code` varchar(32) NOT NULL DEFAULT '' COMMENT 'UNSPSC编码，如43211503',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT 'UNSPSC名称或描述',
  `level` tinyint unsigned NOT NULL DEFAULT '0' COMMENT 'UNSPSC 层级。实测取值 1~6（level=1 仅 23 行）；本表 levelN_id 存旧字典节点 id 的字符串形态，不是编码前缀。code_id=0 行即 code 不在字典的行。',
  `level1_id` varchar(32) NOT NULL DEFAULT '' COMMENT '旧字典 crm_unspsc_codes 的节点 id（字符串形态存储）；本行处于该层级时填自身，否则为空串。入库由 crawler-sync 归一保证。',
  `level2_id` varchar(32) NOT NULL DEFAULT '' COMMENT '旧字典 crm_unspsc_codes 的节点 id（字符串形态存储）；本行处于该层级时填自身，否则为空串。入库由 crawler-sync 归一保证。',
  `level3_id` varchar(32) NOT NULL DEFAULT '' COMMENT '旧字典 crm_unspsc_codes 的节点 id（字符串形态存储）；本行处于该层级时填自身，否则为空串。入库由 crawler-sync 归一保证。',
  `level4_id` varchar(32) NOT NULL DEFAULT '' COMMENT '旧字典 crm_unspsc_codes 的节点 id（字符串形态存储）；本行处于该层级时填自身，否则为空串。入库由 crawler-sync 归一保证。',
  `level5_id` varchar(32) NOT NULL DEFAULT '' COMMENT '旧字典 crm_unspsc_codes 的节点 id（字符串形态存储）；本行处于该层级时填自身，否则为空串。入库由 crawler-sync 归一保证。',
  `created_at` datetime DEFAULT NULL COMMENT '创建时间',
  `updated_at` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_opportunity_code` (`opportunity_id`,`code`),
  KEY `idx_opp_level1_opp` (`level1_id`,`opportunity_id`),
  KEY `idx_opp_level2_opp` (`level2_id`,`opportunity_id`),
  KEY `idx_opp_level3_opp` (`level3_id`,`opportunity_id`),
  KEY `idx_opp_level4_opp` (`level4_id`,`opportunity_id`),
  KEY `idx_opp_level5_opp` (`level5_id`,`opportunity_id`),
  KEY `idx_bid_opp_unspsc_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投标商机分类桥表';

-- ── crm_chat_messages ──
CREATE TABLE `crm_chat_messages` (
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
  CONSTRAINT `fk_chat_msg_session` FOREIGN KEY (`session_id`) REFERENCES `crm_chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_chat_sessions ──
CREATE TABLE `crm_chat_sessions` (
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

-- ── crm_commodity_backbone ──
CREATE TABLE `crm_commodity_backbone` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL COMMENT '树码 UGT-B-<2/4/6/8/10位>，码长即层级：1大类 2中类 3小类 4子类 5品目',
  `parent_code` varchar(16) NOT NULL DEFAULT '' COMMENT '父节点码；大类行为空串（大类之上不再有层）',
  `level` tinyint NOT NULL COMMENT '层级 1~5，必须与 code 去前缀后的长度一致（门禁 BB1 卡）',
  `group_code` varchar(16) NOT NULL COMMENT '所属大类码 UGT-G-NN，冗余到每一层：筛选与权益墙免递归查父',
  `unspsc_prefix` varchar(8) DEFAULT NULL COMMENT '本节点对应的 UNSPSC 前缀：4=子类(6位类) 5=品目(8位)；1~3 级是业务层为 NULL。UNIQUE 让一个码在库里只有一个爹',
  `name_zh` varchar(300) NOT NULL COMMENT '中文名；与 crm_commodity_nodes.name_zh 同宽（实测类名有超 100 字的）',
  `name_en` varchar(300) NOT NULL DEFAULT '' COMMENT '英文名；界面文案走 locale，本列供运维对账与缺中文时兜底',
  `sort` int NOT NULL COMMENT '同父内稳定顺序，按公告量降序固化，不随每日量漂移',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用（停用不删行，保留历史归属）',
  `note` varchar(500) NOT NULL DEFAULT '' COMMENT '命名依据与待审点；机器候选名一律写明，混装桶以「混装:」开头',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  UNIQUE KEY `uk_prefix` (`unspsc_prefix`),
  KEY `idx_parent` (`parent_code`),
  KEY `idx_group` (`group_code`),
  KEY `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='品目树（大类往下重排的五级全量节点；原 crm_commodity_nodes 不动）';

-- ── crm_commodity_group_segments ──
CREATE TABLE `crm_commodity_group_segments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `group_code` varchar(16) NOT NULL COMMENT '大类码',
  `segment_code` varchar(40) NOT NULL COMMENT '品目面段码 UGT-C-*',
  `unspsc_prefix` char(2) NOT NULL COMMENT 'UNSPSC 段前缀：筛选与派生的实际键',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_segment` (`segment_code`),
  UNIQUE KEY `uk_prefix` (`unspsc_prefix`),
  KEY `idx_group` (`group_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='段→大类归属；两个 UNIQUE 把「1:1」写成约束而非代码判断';

-- ── crm_commodity_groups ──
CREATE TABLE `crm_commodity_groups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL COMMENT '大类码 UGT-G-01…UGT-G-32，对外唯一身份',
  `name_zh` varchar(100) NOT NULL COMMENT '中文名（运维导出与人工对账）；界面展示走 locale',
  `sort` int NOT NULL COMMENT 'chip 稳定顺序，按公告量降序固化',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用（停用不删行，保留历史归属）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='品目大类（32 类）：权益墙行业单位与筛选顶层';

-- ── crm_commodity_nodes ──
CREATE TABLE `crm_commodity_nodes` (
  `id` bigint unsigned NOT NULL,
  `code` varchar(40) NOT NULL,
  `unspsc_code` varchar(20) DEFAULT NULL,
  `source` varchar(12) NOT NULL DEFAULT 'unspsc',
  `level` varchar(20) NOT NULL,
  `parent_code` varchar(40) DEFAULT NULL,
  `name_zh` varchar(300) DEFAULT NULL,
  `name_en` varchar(300) DEFAULT NULL,
  `notice_count` int NOT NULL DEFAULT '0',
  `supplier_count` int NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '1',
  `version` varchar(20) NOT NULL DEFAULT 'v1.0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `gap_note` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_level` (`level`),
  KEY `idx_parent` (`parent_code`),
  KEY `idx_unspsc` (`unspsc_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='品目树';

-- ── crm_consent_log ──
CREATE TABLE `crm_consent_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '流水主键（无业务语义，仅定位单条留痕）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '同意人 ID（crm_users.id）；已删用户/匿名化留痕行保持 NULL，属预期非孤儿',
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

-- ── crm_email_templates ──
CREATE TABLE `crm_email_templates` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件模板库（源=内网爬虫库，人工触达+自动批次共用）';

-- ── crm_employees ──
CREATE TABLE `crm_employees` (
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

-- ── crm_follow_up_logs ──
CREATE TABLE `crm_follow_up_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `item_id` bigint unsigned NOT NULL COMMENT 'crm_outreach_items.id',
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

-- ── crm_industry_calibration ──
CREATE TABLE `crm_industry_calibration` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `supplier_id` bigint unsigned NOT NULL,
  `old_industry` varchar(100) DEFAULT NULL,
  `predicted_codes` varchar(500) DEFAULT NULL,
  `confidence` decimal(4,3) DEFAULT NULL,
  `cannot_classify` tinyint DEFAULT '0',
  `reason` varchar(500) DEFAULT NULL,
  `raw_response` text,
  `reviewed` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_industry_nodes ──
CREATE TABLE `crm_industry_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL COMMENT '行业码 UGT-I- + 定长分层数字（门类2位/大类4位/中类6位/小类与自研8位），码长即层级',
  `src_code` varchar(20) NOT NULL COMMENT '国标码 A-T / 01 / 011 / 0111 / X01-X24，仅作构建溯源',
  `source` varchar(12) NOT NULL DEFAULT 'gb' COMMENT 'gb=国标官方节点 self=我方自研延伸层',
  `level` varchar(20) NOT NULL COMMENT 'section|division|group|subclass|extension',
  `parent_code` varchar(40) DEFAULT NULL,
  `name_zh` varchar(300) DEFAULT NULL COMMENT '国标官方中文名（含第1号修改单）',
  `name_en` varchar(300) DEFAULT NULL COMMENT 'ISIC Rev.4 官方英文，经国标附录C 对照定锚',
  `description` text COMMENT '国标官方释义',
  `supplier_count` int NOT NULL DEFAULT '0' COMMENT '直接挂靠的供应商画像数',
  `status` tinyint NOT NULL DEFAULT '1',
  `version` varchar(20) NOT NULL DEFAULT 'v1.1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_level` (`level`),
  KEY `idx_parent` (`parent_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业树';

-- ── crm_learning_material_purchases ──
CREATE TABLE `crm_learning_material_purchases` (
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

-- ── crm_learning_materials ──
CREATE TABLE `crm_learning_materials` (
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

-- ── crm_match_verdict ──
CREATE TABLE `crm_match_verdict` (
  `supplier_id` int NOT NULL COMMENT '内网爬虫库 supplier.id',
  `opportunity_id` int NOT NULL,
  `verdict` varchar(8) DEFAULT NULL COMMENT '相关/擦边/无关',
  `why` varchar(500) DEFAULT NULL COMMENT 'LLM 判定理由原文',
  `prof` float DEFAULT NULL,
  `family` varchar(200) DEFAULT NULL,
  `judged_at` datetime DEFAULT NULL,
  PRIMARY KEY (`supplier_id`,`opportunity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='LLM 供需匹配终审（源=内网爬虫库）';

-- ── crm_message_tracking ──
CREATE TABLE `crm_message_tracking` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件发送/打开/回复跟踪（源=内网爬虫库）';

-- ── crm_monthly_kpi ──
CREATE TABLE `crm_monthly_kpi` (
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
  CONSTRAINT `fk_monthly_kpi_employee` FOREIGN KEY (`employee_id`) REFERENCES `crm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='员工月度KPI完成情况';

-- ── crm_notice_ai_summaries ──
CREATE TABLE `crm_notice_ai_summaries` (
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

-- ── crm_notice_amount_cache ──
CREATE TABLE `crm_notice_amount_cache` (
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

-- ── crm_notice_favorites ──
CREATE TABLE `crm_notice_favorites` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_notice` (`user_id`,`notice_id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `idx_notice` (`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='收藏公告';

-- ── crm_notice_interests ──
CREATE TABLE `crm_notice_interests` (
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

-- ── crm_notice_search ──
CREATE TABLE `crm_notice_search` (
  `id` int unsigned NOT NULL,
  `notice_id` varchar(100) NOT NULL,
  `title` varchar(1000) NOT NULL DEFAULT '',
  `reference` varchar(200) NOT NULL DEFAULT '',
  `description` text NOT NULL,
  `title_zh` varchar(1000) NOT NULL DEFAULT '',
  `description_zh` text NOT NULL,
  `title_en` varchar(1000) NOT NULL DEFAULT '',
  `description_en` text NOT NULL,
  `country_std` varchar(100) NOT NULL DEFAULT '',
  `agency_std` varchar(200) NOT NULL DEFAULT '',
  `agency_group` varchar(100) NOT NULL DEFAULT '',
  `notice_type_std` varchar(20) NOT NULL DEFAULT '',
  `deadline_sec` bigint unsigned NOT NULL DEFAULT '0',
  `estimated_value` decimal(20,2) NOT NULL DEFAULT '0.00',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `entry_source` varchar(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源（同步自主表）',
  `unspsc_level1` text NOT NULL,
  `unspsc_level2` text NOT NULL,
  `unspsc_level3` text NOT NULL,
  `unspsc_level4` text NOT NULL,
  `unspsc_level5` text NOT NULL,
  `precise_level1` text NOT NULL COMMENT '精准 UNSPSC 一级 ID（approved 候选码解析，无则回填原标签）',
  `precise_level2` text NOT NULL,
  `precise_level3` text NOT NULL,
  `precise_level4` text NOT NULL,
  `precise_level5` text NOT NULL,
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
  `published_date` varchar(50) DEFAULT NULL COMMENT '公告发布日期（同步自 crm_bid_notices.published_date）',
  `sync_src_hash` char(32) NOT NULL DEFAULT '' COMMENT '宽表内容与输入快照的一致性指纹，由 buildWideRow 同快照写入，对账只比对不修改',
  `group_codes` text COMMENT '所属大类码集合，逗号分隔（OR 语义并集）',
  `code_path` text COMMENT '全部祖先 UNSPSC 前缀，逗号分隔（所见即所得命中键）',
  `precise_path` text COMMENT '同 code_path，来源=approved 精准候选码',
  PRIMARY KEY (`id`),
  KEY `idx_ns_deadline_desc` (`deadline_sec` DESC),
  KEY `idx_ns_id_desc` (`id` DESC),
  KEY `idx_ns_deadline` (`deadline_sec`),
  KEY `idx_ns_country` (`country_std`),
  KEY `idx_ns_agency_group` (`agency_group`),
  KEY `idx_ns_type` (`notice_type_std`),
  KEY `idx_ns_featured` (`is_featured`),
  KEY `idx_ns_reference` (`reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='宽表';

-- ── crm_notice_stats ──
CREATE TABLE `crm_notice_stats` (
  `stat_key` varchar(100) NOT NULL,
  `stat_value` int unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`stat_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_notice_translations ──
CREATE TABLE `crm_notice_translations` (
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

-- ── crm_opportunity_translations ──
CREATE TABLE `crm_opportunity_translations` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_opportunity_unlocks ──
CREATE TABLE `crm_opportunity_unlocks` (
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

-- ── crm_outreach_batches ──
CREATE TABLE `crm_outreach_batches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `batch_no` varchar(32) NOT NULL COMMENT '对外批次号 bat_ 前缀',
  `batch_name` varchar(128) NOT NULL DEFAULT '',
  `channel` varchar(16) NOT NULL DEFAULT 'email',
  `template_id` int unsigned DEFAULT NULL,
  `account_id` int unsigned DEFAULT NULL,
  `total_count` int unsigned NOT NULL DEFAULT '0',
  `sent_count` int unsigned NOT NULL DEFAULT '0',
  `failed_count` int unsigned NOT NULL DEFAULT '0',
  `reply_count` int unsigned NOT NULL DEFAULT '0',
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `creator_id` int unsigned DEFAULT NULL,
  `tenant_id` int unsigned NOT NULL DEFAULT '1',
  `remark` varchar(255) NOT NULL DEFAULT '',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='触达批次（源=内网爬虫库）';

-- ── crm_outreach_items ──
CREATE TABLE `crm_outreach_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `batch_id` bigint unsigned NOT NULL COMMENT '所属批次 crm_outreach_batches.id',
  `company_id` bigint unsigned DEFAULT NULL COMMENT '内网爬虫库 supplier.id（≠云库 supplier）',
  `company_name` varchar(191) NOT NULL DEFAULT '' COMMENT '公司名（冗余快照，随批次落库）',
  `phone` varchar(32) NOT NULL DEFAULT '' COMMENT '电话（国际格式，含国家码）',
  `email` varchar(191) NOT NULL DEFAULT '' COMMENT '邮箱',
  `send_status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending排队/sent已发/failed失败/hold待把关/excluded剔除/空=备选',
  `send_count` int unsigned NOT NULL DEFAULT '0',
  `fail_reason` varchar(255) NOT NULL DEFAULT '',
  `outreach_status` varchar(20) NOT NULL DEFAULT 'none' COMMENT 'none/sent/delivered/opened/read/replied；reject:前缀=剔除原因',
  `check_status` varchar(20) NOT NULL DEFAULT 'unverified' COMMENT 'unverified/verified/call_needed/failed',
  `salutation` varchar(50) DEFAULT NULL COMMENT '核验通过的称呼(填{name})，纯 ASCII 判英文语系',
  `check_time` datetime DEFAULT NULL,
  `check_evidence` varchar(255) DEFAULT NULL,
  `message_id` varchar(64) DEFAULT NULL COMMENT 'CRM 消息 ID msg_ 前缀',
  `provider_message_id` varchar(191) DEFAULT NULL,
  `tracking_token` varchar(64) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL COMMENT '开信像素首次请求时间（权威口径在 tracking 表）',
  `open_count` int unsigned NOT NULL DEFAULT '0',
  `last_open_at` datetime DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `replied_at` datetime DEFAULT NULL,
  `bounced_at` datetime DEFAULT NULL,
  `bounce_type` varchar(10) DEFAULT NULL,
  `unsubscribed_at` datetime DEFAULT NULL,
  `complained_at` datetime DEFAULT NULL,
  `reply_intent` varchar(20) DEFAULT NULL COMMENT 'unknown/interested/inquiry/not_interested/wrong_contact/auto_reply',
  `intent_score` tinyint unsigned DEFAULT NULL,
  `biz_status` varchar(20) NOT NULL DEFAULT 'none' COMMENT 'none/following/quoted/sampling/negotiating/won/lost',
  `biz_updated_at` datetime DEFAULT NULL,
  `reply_count` int unsigned NOT NULL DEFAULT '0',
  `last_reply_message_id` varchar(64) DEFAULT NULL,
  `status_updated_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `reco_id` bigint DEFAULT NULL,
  `reco_pitch` varchar(1000) DEFAULT NULL,
  `reco_family` varchar(100) DEFAULT NULL,
  `reco_opp_id` bigint DEFAULT NULL,
  `ab_variant` varchar(8) DEFAULT NULL,
  `reco_top3` varchar(600) DEFAULT NULL COMMENT 'top3 商单 id 逗号分隔，首位=主推(reco_opp_id)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_company` (`batch_id`,`company_id`),
  UNIQUE KEY `uk_message_id` (`message_id`),
  UNIQUE KEY `uk_tracking_token` (`tracking_token`),
  KEY `idx_batch_status` (`batch_id`,`send_status`),
  KEY `idx_sent_at` (`sent_at`),
  KEY `idx_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='触达明细';

-- ── crm_outreach_supplier ──
CREATE TABLE `crm_outreach_supplier` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `company` varchar(200) NOT NULL DEFAULT '' COMMENT '公司名称',
  `country` varchar(100) NOT NULL DEFAULT '',
  `country_code` varchar(5) DEFAULT '',
  `province` varchar(50) DEFAULT NULL,
  `city` varchar(50) DEFAULT NULL,
  `contact` varchar(100) NOT NULL DEFAULT '',
  `position` varchar(100) DEFAULT '',
  `phone` varchar(60) NOT NULL DEFAULT '',
  `email` varchar(150) NOT NULL DEFAULT '',
  `address` varchar(500) DEFAULT '',
  `website` varchar(255) NOT NULL DEFAULT '',
  `industry` varchar(200) NOT NULL DEFAULT '' COMMENT '行业/主要产品',
  `products` varchar(500) DEFAULT '',
  `certification` varchar(255) DEFAULT NULL,
  `product_keywords` text,
  `unspsc_codes_snapshot` text,
  `unspsc_match_status` varchar(20) NOT NULL DEFAULT 'pending',
  `unspsc_matched_at` datetime DEFAULT NULL,
  `last_match_at` datetime DEFAULT NULL,
  `supplier_grade` varchar(20) DEFAULT NULL COMMENT 'A高价值/B可跟进/C沉淀/D无效',
  `data_quality_score` decimal(5,2) NOT NULL DEFAULT '0.00',
  `industry_id` int DEFAULT '0',
  `type` varchar(20) NOT NULL DEFAULT 'foreign',
  `business_type` varchar(50) DEFAULT NULL,
  `coop_status` tinyint NOT NULL DEFAULT '2',
  `remark` text,
  `source_channel` varchar(80) DEFAULT NULL,
  `source_url` varchar(500) DEFAULT NULL,
  `tenant_id` int NOT NULL DEFAULT '0',
  `addtime` int NOT NULL DEFAULT '0',
  `legal_rep` varchar(50) DEFAULT NULL,
  `intro` text,
  `name_confirmed` varchar(120) DEFAULT NULL,
  `registered_address` varchar(255) DEFAULT NULL,
  `registered_phone` varchar(40) DEFAULT NULL,
  `registered_email` varchar(120) DEFAULT NULL,
  `established_at` varchar(20) DEFAULT NULL,
  `registered_capital` varchar(40) DEFAULT NULL,
  `credit_code` varchar(30) DEFAULT NULL,
  `webcheck_status` varchar(10) DEFAULT NULL,
  `webcheck_at` datetime DEFAULT NULL,
  `info_checked` tinyint(1) NOT NULL DEFAULT '0',
  `check_note` varchar(500) DEFAULT NULL,
  `merged_id` int DEFAULT NULL COMMENT 'supplier_merged.id（云侧为 crm_outreach_supplier_merged）',
  `verify_status` varchar(20) DEFAULT NULL,
  `verify_owner` varchar(50) DEFAULT NULL,
  `verify_at` datetime DEFAULT NULL,
  `cq_status` varchar(20) DEFAULT NULL,
  `cq_owner` varchar(40) DEFAULT NULL,
  `cq_at` datetime DEFAULT NULL,
  `cq_tyc` json DEFAULT NULL,
  `cq_aqc` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_merged` (`merged_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='触达供应商档案（源=内网爬虫库 supplier，≠云库 supplier）';

-- ── crm_outreach_supplier_merged ──
CREATE TABLE `crm_outreach_supplier_merged` (
  `id` int NOT NULL,
  `company` varchar(200) NOT NULL,
  `country` varchar(100) DEFAULT 'China',
  `country_code` varchar(5) DEFAULT 'CN',
  `industry` varchar(200) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL COMMENT '来源: mic/alibaba/cmef/100ppi/okorder/cnauto/globalsources/ec21；多源=主+次',
  `coop_status` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='合并供应商主数据窄表（源=内网爬虫库 supplier_merged，仅看板用列）';

-- ── crm_password_resets ──
CREATE TABLE `crm_password_resets` (
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

-- ── crm_payment_orders ──
CREATE TABLE `crm_payment_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `order_no` varchar(80) NOT NULL,
  `provider` enum('alipay','wechat','mock') NOT NULL,
  `plan_code` varchar(60) NOT NULL,
  `order_type` varchar(20) NOT NULL DEFAULT 'new',
  `original_order_no` varchar(80) DEFAULT NULL,
  `notice_id` bigint unsigned DEFAULT NULL,
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

-- ── crm_payment_provider_configs ──
CREATE TABLE `crm_payment_provider_configs` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_plan_benefits ──
CREATE TABLE `crm_plan_benefits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(64) NOT NULL COMMENT 'FK crm_plan_catalog：这一格属于哪档套餐',
  `benefit_code` varchar(64) NOT NULL COMMENT 'FK crm_benefit_catalog：这一格是哪个权益',
  `value_level` int DEFAULT NULL COMMENT '层级值：布尔行只允许 0/1；枚举行 0..4，含义查权益目录 level_dict',
  `value_num` int DEFAULT NULL COMMENT '额度值：正整数=数量；-1=不限（全库唯一的不限表达，禁止用大数字冒充）；0=该档明确无额度（如普通用户免费额度 0 条）',
  `value_amount` decimal(10,2) DEFAULT NULL COMMENT '金额值：0.00=该档包含/免费；正数=该档会员价',
  `note_zh` varchar(255) DEFAULT NULL COMMENT '格级边界说明，如"批量下载按增值服务计费"，前端锁定态提示直接渲染',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_benefit` (`plan_code`,`benefit_code`),
  KEY `idx_benefit` (`benefit_code`,`plan_code`),
  CONSTRAINT `fk_pb_benefit` FOREIGN KEY (`benefit_code`) REFERENCES `crm_benefit_catalog` (`benefit_code`),
  CONSTRAINT `fk_pb_plan` FOREIGN KEY (`plan_code`) REFERENCES `crm_plan_catalog` (`plan_code`),
  CONSTRAINT `chk_one_value` CHECK (((((`value_level` is not null) + (`value_num` is not null)) + (`value_amount` is not null)) = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐权益矩阵表';

-- ── crm_plan_catalog ──
CREATE TABLE `crm_plan_catalog` (
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

-- ── crm_plan_subscriptions ──
CREATE TABLE `crm_plan_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` bigint unsigned NOT NULL COMMENT '订阅归属人（企业档为主账号）；单轨非空',
  `plan_code` varchar(64) NOT NULL COMMENT 'FK crm_plan_catalog：买了哪档',
  `source_order_no` varchar(80) NOT NULL COMMENT '成交订单号，非空硬约束——无订单来源的订阅禁止存在，退款与对账唯一锚点',
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
  CONSTRAINT `fk_sub_plan__p3` FOREIGN KEY (`plan_code`) REFERENCES `crm_plan_catalog` (`plan_code`),
  CONSTRAINT `fk_sub_replaced__p3` FOREIGN KEY (`replaced_by_id`) REFERENCES `crm_plan_subscriptions` (`id`),
  CONSTRAINT `crm_plan_subscriptions_chk_1` CHECK (((`expires_at` is null) or (`expires_at` > `started_at`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐订阅表：记录用户对套餐的每一次购买事实（归属人、成交订单号、实付与席位快照、有效期与状态、升级链）';

-- ── crm_product_keyword_groups ──
CREATE TABLE `crm_product_keyword_groups` (
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

-- ── crm_reco_supplier_opportunity ──
CREATE TABLE `crm_reco_supplier_opportunity` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机×供应商推荐明细（源=内网爬虫库）';

-- ── crm_reco_weight_profile ──
CREATE TABLE `crm_reco_weight_profile` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `w_unspsc` decimal(5,3) NOT NULL DEFAULT '0.500',
  `w_agency` decimal(5,3) NOT NULL DEFAULT '0.150',
  `w_amount` decimal(5,3) NOT NULL DEFAULT '0.100',
  `w_geo` decimal(5,3) NOT NULL DEFAULT '0.100',
  `w_urgency` decimal(5,3) NOT NULL DEFAULT '0.150',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推荐权重档案。';

-- ── crm_refresh_tokens ──
CREATE TABLE `crm_refresh_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '所属用户 ID（crm_users.id）；用于按用户吊销全部会话',
  `token_hash` varchar(128) NOT NULL COMMENT 'Refresh Token 的 SHA-256 哈希（不存明文，泄露不可反推）',
  `expires_at` datetime NOT NULL COMMENT '过期时间（与 JWT 有效期对齐，7 天）；到期由周期任务清理',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签发时间（审计用）',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='前台哈希登记表';

-- ── crm_rfx_platform_map ──
CREATE TABLE `crm_rfx_platform_map` (
  `platform_key` varchar(64) NOT NULL,
  `name_zh` varchar(100) NOT NULL,
  `name_en` varchar(120) NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`platform_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='招标平台中英文名映射（源=内网爬虫库）';

-- ── crm_service_catalog ──
CREATE TABLE `crm_service_catalog` (
  `service_code` varchar(64) NOT NULL COMMENT '服务稳定机器码',
  `category` enum('pro_service','advisory','api_license') NOT NULL COMMENT '服务类别：专业增值 / 顾问服务 / API 数据授权',
  `name_zh` varchar(120) NOT NULL,
  `name_en` varchar(120) NOT NULL COMMENT '官网英文名',
  `price_mode` enum('per_unit','per_time','per_year','token','project','quote','contact') NOT NULL COMMENT '计价形态：按单件/按次/按年包/按算力/按项目/单独报价/联系销售，驱动订单定价与展示后缀',
  `standard_price` decimal(10,2) DEFAULT NULL COMMENT '标准价；token/project/quote/contact 形态为 NULL（算力计费与另议不冒充价格）',
  `price_from` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=标准价是"起"价，前端展示必须带"起"字，防一口价误读',
  `currency` varchar(10) NOT NULL DEFAULT 'CNY',
  `grant_benefit_code` varchar(64) DEFAULT NULL COMMENT '成交后向额度账本充值的权益码（FK crm_benefit_catalog，须 is_consumable=1）；纯交付型为 NULL',
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
  `credit_to_annual_plan` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=该服务成交单可在购买年付套餐时全额抵扣本单金额（文档「升级年包可全额抵扣」）；核销锚点=crm_payment_orders.original_order_no 记本服务单号，一张服务单只核销一次',
  PRIMARY KEY (`service_code`),
  KEY `idx_cat_sort` (`category`,`is_active`,`sort_order`),
  KEY `fk_svc_grant_benefit` (`grant_benefit_code`),
  CONSTRAINT `fk_svc_grant_benefit` FOREIGN KEY (`grant_benefit_code`) REFERENCES `crm_benefit_catalog` (`benefit_code`),
  CONSTRAINT `chk_grant_pair` CHECK (((`grant_benefit_code` is null) = (`grant_quota` is null))),
  CONSTRAINT `chk_grant_period` CHECK (((`grant_benefit_code` is null) or (`grant_period` <> _utf8mb4'none'))),
  CONSTRAINT `chk_price_by_mode` CHECK (((`price_mode` in (_utf8mb4'token',_utf8mb4'project',_utf8mb4'quote',_utf8mb4'contact')) or ((`standard_price` is not null) and (`standard_price` > 0)))),
  CONSTRAINT `chk_price_from` CHECK (((`price_from` = 0) or (`standard_price` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='增值服务目录表：非订阅制服务（按次/按项目/按合同购买）的品名、计价形态、标准价与成交后额度充值规则';

-- ── crm_service_orders ──
CREATE TABLE `crm_service_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(80) NOT NULL COMMENT '对外业务订单号，与支付域对账的唯一锚点',
  `user_id` bigint unsigned NOT NULL COMMENT '下单账号',
  `service_code` varchar(64) NOT NULL COMMENT 'FK crm_service_catalog：买了哪个服务',
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
  CONSTRAINT `fk_ord_service__p3` FOREIGN KEY (`service_code`) REFERENCES `crm_service_catalog` (`service_code`),
  CONSTRAINT `crm_service_orders_chk_1` CHECK (((`granted_subscription_id` is null) or (`status` = _utf8mb4'paid'))),
  CONSTRAINT `crm_service_orders_chk_2` CHECK ((`quantity` > 0)),
  CONSTRAINT `crm_service_orders_chk_3` CHECK ((`sale_mode_snapshot` in (_utf8mb4'self',_utf8mb4'lead',_utf8mb4'contract'))),
  CONSTRAINT `crm_service_orders_chk_4` CHECK ((`status` in (_utf8mb4'lead',_utf8mb4'pending',_utf8mb4'paid',_utf8mb4'cancelled',_utf8mb4'refunded')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='服务订购订单表：增值服务的下单与成交事实（数量、单价快照、状态机、合同编号、额度充值落点）；订阅类购买不走本表';

-- ── crm_supplier_certifications ──
CREATE TABLE `crm_supplier_certifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL COMMENT '认证名称',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商认证证书字典表';

-- ── crm_supplier_claims ──
CREATE TABLE `crm_supplier_claims` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '申请账号 crm_users.id；补录未填邮箱时 NULL',
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

-- ── crm_supplier_diagnosis ──
CREATE TABLE `crm_supplier_diagnosis` (
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

-- ── crm_supplier_industry_rel ──
CREATE TABLE `crm_supplier_industry_rel` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商×行业面标签关系(UGT-I)';

-- ── crm_supplier_qualification ──
CREATE TABLE `crm_supplier_qualification` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL COMMENT '企业名称',
  `company_website` varchar(500) NOT NULL COMMENT '企业官网网址',
  `founding_year` varchar(20) DEFAULT NULL COMMENT '企业成立年份',
  `employee_count` varchar(40) DEFAULT NULL COMMENT '企业规模（员工人数）',
  `industry` varchar(500) NOT NULL COMMENT '企业所属行业（逗号分隔）',
  `other_industry` varchar(255) DEFAULT NULL COMMENT '其他行业（当industry包含"其他"时填写）',
  `main_product` varchar(500) NOT NULL COMMENT '企业主营产品',
  `export_scale` varchar(40) NOT NULL COMMENT '近2年出口/国际业务规模',
  `certifications` varchar(1000) NOT NULL COMMENT '资质证书（逗号分隔）',
  `other_certifications` text COMMENT '其他资质证书',
  `service_countries` text NOT NULL COMMENT '售后点/服务站/维修点所在国家',
  `overseas_companies` text NOT NULL COMMENT '海外分公司/投资公司所在国家',
  `ungm_status` varchar(40) NOT NULL COMMENT 'UNGM注册状态',
  `english_team` varchar(40) NOT NULL COMMENT '英文团队能力',
  `payment_terms` varchar(40) NOT NULL COMMENT '是否接受30天账期',
  `bid_willingness` varchar(40) NOT NULL COMMENT '是否愿意参与投标',
  `contact_info` varchar(255) DEFAULT NULL COMMENT '联系人微信及电话（bid_willingness=是时填写）',
  `audit_status` varchar(30) NOT NULL DEFAULT 'pending' COMMENT '审核状态: pending/approved/rejected',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '审核驳回原因',
  `ip` varchar(64) DEFAULT NULL COMMENT '提交IP',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '关联用户（注册后回写）',
  `referral_employee_id` int unsigned DEFAULT NULL COMMENT '推荐员工（KPI归属）',
  `source` varchar(30) NOT NULL DEFAULT 'qualification' COMMENT '来源: registration/diagnosis/qualification',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_status` (`audit_status`),
  KEY `idx_company_name` (`company_name`),
  KEY `idx_eval_user` (`user_id`),
  KEY `idx_eval_employee` (`referral_employee_id`),
  KEY `idx_eval_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商采购诊断。';

-- ── crm_supplier_unspsc_interests ──
CREATE TABLE `crm_supplier_unspsc_interests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_table` varchar(32) NOT NULL DEFAULT 'supplier',
  `supplier_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '供应商ID，对应供应商表ID',
  `code_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT 'UNSPSC字典ID，暂未绑定字典时为0',
  `code` varchar(32) NOT NULL DEFAULT '' COMMENT 'UNSPSC编码，如43211503',
  `name` varchar(255) NOT NULL DEFAULT '' COMMENT 'UNSPSC名称或描述',
  `level` tinyint unsigned NOT NULL DEFAULT '0' COMMENT 'UNSPSC层级：1大类/2二级/3三级/4四级/5五级',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商UNSPSC兴趣画像表';

-- ── crm_sync_watermark ──
CREATE TABLE `crm_sync_watermark` (
  `table_name` varchar(64) NOT NULL,
  `id_wm` bigint unsigned NOT NULL DEFAULT '0',
  `time_wm` varchar(32) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_system_configs ──
CREATE TABLE `crm_system_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `config_group` varchar(40) NOT NULL DEFAULT 'system',
  `config_key` varchar(100) NOT NULL,
  `config_value` text,
  `description` varchar(200) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_key` (`config_group`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_taxonomy_code_map_v10_v11 ──
CREATE TABLE `crm_taxonomy_code_map_v10_v11` (
  `id` bigint unsigned NOT NULL,
  `old_code` varchar(40) NOT NULL,
  `new_code` varchar(40) NOT NULL,
  `new_parent_code` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_old` (`old_code`),
  UNIQUE KEY `uk_new` (`new_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业面自有码迁移映射 v1.0(GB轴)→v1.1(纯数字层级) 2026-10-09';

-- ── crm_taxonomy_intake ──
CREATE TABLE `crm_taxonomy_intake` (
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

-- ── crm_training_download_stats ──
CREATE TABLE `crm_training_download_stats` (
  `material_id` varchar(60) NOT NULL,
  `file_name` varchar(120) NOT NULL DEFAULT '',
  `download_count` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── crm_training_registrations ──
CREATE TABLE `crm_training_registrations` (
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

-- ── crm_unspsc_codes ──
CREATE TABLE `crm_unspsc_codes` (
  `id` int NOT NULL,
  `code` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `title_zh` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `parent_id` int DEFAULT NULL,
  `level` tinyint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_code` (`code`),
  KEY `idx_unspsc_level_id` (`level`,`id`),
  KEY `idx_unspsc_parent_code` (`parent_id`,`code`),
  FULLTEXT KEY `ft_dict_titles` (`title`,`title_zh`) /*!50100 WITH PARSER `ngram` */ 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ── crm_user_industry_prefs ──
CREATE TABLE `crm_user_industry_prefs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `level1_id` int DEFAULT NULL,
  `level2_id` int DEFAULT NULL,
  `level3_id` int DEFAULT NULL,
  `level4_id` int DEFAULT NULL,
  `level5_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `group_code` varchar(16) NOT NULL DEFAULT '' COMMENT '权益墙行业单位（大类码），必填',
  `commodity_code` varchar(40) NOT NULL DEFAULT '' COMMENT '品目面码，可停在段/族/类/品目任一层；空=只订到大类',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_pref` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户行业偏好。';

-- ── crm_user_interest_codes ──
CREATE TABLE `crm_user_interest_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `code_id` int DEFAULT NULL,
  `code` varchar(8) NOT NULL,
  `level` tinyint NOT NULL,
  `source` varchar(40) NOT NULL,
  `weight` decimal(8,2) NOT NULL DEFAULT '1.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_code_source` (`user_id`,`code`,`source`),
  KEY `idx_code_id` (`code_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户关注的公告编码。';

-- ── crm_user_llm_config ──
CREATE TABLE `crm_user_llm_config` (
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

-- ── crm_user_notice_views ──
CREATE TABLE `crm_user_notice_views` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `notice_id` bigint unsigned DEFAULT NULL,
  `viewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`,`viewed_at`),
  KEY `idx_notice_view` (`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户查看过的公告。';

-- ── crm_user_reco_feedback ──
CREATE TABLE `crm_user_reco_feedback` (
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

-- ── crm_user_search_log ──
CREATE TABLE `crm_user_search_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '发起搜索的登录用户，锚 crm_users.id；匿名检索不记录',
  `q` varchar(200) DEFAULT NULL COMMENT '搜索关键词；NULL=未输入关键词(仅筛选检索)',
  `country` varchar(100) DEFAULT NULL COMMENT '国家筛选项',
  `filters` json DEFAULT NULL COMMENT '结构化筛选组合：code_id/deadline_from/deadline_to/deadline_within_days/notice_type/featured/sort/forced_level1_id',
  `result_cnt` int NOT NULL DEFAULT '0' COMMENT '本次检索返回结果总数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检索发生时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`,`created_at`),
  KEY `idx_zero_result` (`result_cnt`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告搜索行为日志。(仅登录用户)';

-- ── crm_user_supplier_pool ──
CREATE TABLE `crm_user_supplier_pool` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `supplier_id` bigint unsigned DEFAULT NULL COMMENT '关联 supplier 表',
  `qualification_id` bigint unsigned DEFAULT NULL COMMENT '关联 crm_supplier_qualification 表',
  `source` varchar(20) NOT NULL DEFAULT 'manual' COMMENT '来源: platform/manual',
  `notes` text COMMENT '私有备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_supplier` (`user_id`,`supplier_id`),
  UNIQUE KEY `uk_user_qualification` (`user_id`,`qualification_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务员的供应商库。';

-- ── crm_users ──
CREATE TABLE `crm_users` (
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
  `referral_employee_id` int unsigned DEFAULT NULL COMMENT '邀请码对应员工 ID（crm_employees.id）',
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
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 ROW_FORMAT=DYNAMIC;

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
  `industry` varchar(200) NOT NULL DEFAULT '' COMMENT '行业/主要产品',
  `industry_code` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '主行业码 UGT-I-*（V3 直标）',
  `certification` varchar(500) DEFAULT NULL,
  `products` varchar(500) DEFAULT '' COMMENT '主营产品',
  `product_keywords` text COMMENT '产品关键词/别名/采集抽取词，用于UNSPSC补码与商机匹配',
  `unspsc_codes_snapshot` text COMMENT '供应商UNSPSC候选码快照(JSON)，用于快速查看和审计',
  `unspsc_match_status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'UNSPSC补码状态：pending待识别 matched已匹配 reviewed已复核 failed失败',
  `data_quality_score` decimal(5,2) GENERATED ALWAYS AS (round(((((((((((((((((((((((`country` is not null) and (trim(`country`) <> _utf8mb4'')) + ((`province` is not null) and (trim(`province`) <> _utf8mb4''))) + ((`city` is not null) and (trim(`city`) <> _utf8mb4''))) + ((`address` is not null) and (trim(`address`) <> _utf8mb4''))) + ((`contact` is not null) and (trim(`contact`) <> _utf8mb4''))) + ((`position` is not null) and (trim(`position`) <> _utf8mb4''))) + ((`phone` is not null) and (trim(`phone`) <> _utf8mb4''))) + ((`email` is not null) and (trim(`email`) <> _utf8mb4''))) + ((`website` is not null) and (trim(`website`) <> _utf8mb4''))) + ((`industry` is not null) and (trim(`industry`) <> _utf8mb4''))) + ((`products` is not null) and (trim(`products`) <> _utf8mb4''))) + ((`type` is not null) and (trim(`type`) <> _utf8mb4''))) + ((`business_type` is not null) and (trim(`business_type`) <> _utf8mb4''))) + ((`certification` is not null) and (trim(`certification`) <> _utf8mb4''))) + ((`established_at` is not null) and (trim(`established_at`) <> _utf8mb4''))) + ((`registered_capital` is not null) and (trim(`registered_capital`) <> _utf8mb4''))) + ((`credit_code` is not null) and (trim(`credit_code`) <> _utf8mb4''))) + ((`legal_rep` is not null) and (trim(`legal_rep`) <> _utf8mb4''))) + ((`intro` is not null) and (trim(`intro`) <> _utf8mb4''))) + ((`registered_address` is not null) and (trim(`registered_address`) <> _utf8mb4''))) * 5.0),2)) STORED NOT NULL,
  `industry_id` int DEFAULT '0' COMMENT '行业ID(关联crm_client_hangye或ungm_meta)',
  `type` varchar(20) NOT NULL DEFAULT 'foreign' COMMENT 'foreign=国外 domestic=国内',
  `business_type` varchar(50) DEFAULT NULL COMMENT '供应商业务身份，如制造商/贸易公司/认证供应商',
  `coop_status` tinyint NOT NULL DEFAULT '2' COMMENT '0=已停止 1=合作中 2=待评估',
  `remark` text COMMENT '备注',
  `source_channel` varchar(80) DEFAULT NULL COMMENT '供应商来源渠道，如OS报名/Google Maps/Alibaba/LinkedIn/官网采集',
  `source_url` varchar(500) DEFAULT NULL COMMENT '供应商来源页面URL，可追溯采集来源',
  `addtime` int NOT NULL DEFAULT '0' COMMENT '添加时间戳',
  `legal_rep` varchar(50) DEFAULT NULL,
  `intro` text,
  `business_scope` text COMMENT '经营范围（来源：supplier_merged 清洗合并）',
  `name_confirmed` varchar(120) DEFAULT NULL,
  `registered_address` varchar(255) DEFAULT NULL,
  `registered_phone` varchar(40) DEFAULT NULL,
  `registered_email` varchar(120) DEFAULT NULL,
  `established_at` varchar(20) DEFAULT NULL,
  `registered_capital` varchar(40) DEFAULT NULL,
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
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_verify_status` (`verify_status`,`id`),
  KEY `idx_claim_status` (`claim_status`),
  KEY `idx_btype_code` (`business_type_code`),
  KEY `idx_coop_status` (`coop_status`,`id`),
  KEY `idx_credit_code` (`credit_code`),
  KEY `idx_company` (`company`(64)),
  FULLTEXT KEY `ft_supplier_products` (`products`,`product_keywords`) /*!50100 WITH PARSER `ngram` */ 
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
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 ROW_FORMAT=DYNAMIC COMMENT='备案号';

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

-- ── training_gallery_categories ──
CREATE TABLE `training_gallery_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name_zh` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `description_zh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `description_en` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `cover_image` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_training_gallery_cat_status` (`status`,`sort_order`)
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

SET FOREIGN_KEY_CHECKS = 1;
