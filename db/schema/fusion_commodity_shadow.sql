-- ── 品目树融合（影子表，集百家之长·单一融合树）──
-- 结构基线的一部分（放 db/schema/，e2e 按字典序在 baseline.sql 之后导入）。
-- ★ 铁律：本文件只【新建】融合影子表 + 给宽表【增并行影子列】，绝不 ALTER/DROP 现有
--   crm_commodity_backbone、crm_notice_backbone_nodes，也不改动在用 backbone_path 列。
--   旧树原样保留作回滚位；正式切换属破坏性动作，须人工闸口点火（见设计 §3.4）。
-- 码制：code = `UGT-` + 每层 3 位定宽，码长即层级、层数无硬顶；更深 = 以它为前缀。

-- 融合节点表（影子）
CREATE TABLE `crm_commodity_backbone_fusion__new` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '融合码 UGT-<3位×层>，码长即层级，层数无硬顶；纯数字起头与旧 UGT-B-/C-/G- 天然互斥',
  `parent_code` varchar(64) NOT NULL DEFAULT '' COMMENT '父码=去末3位；L1 为空串',
  `level` tinyint NOT NULL COMMENT '层级，须 =(LENGTH(code)-4)/3（门禁 FU1 卡）',
  `depth` int NOT NULL COMMENT '到根层数（当前=level）',
  `group_code` varchar(16) NOT NULL COMMENT '旧大类归属 UGT-G-NN：每个新 L1 必属且仅属一个旧大类（大类只增不减、无损回溯，门禁 FU2）',
  `axis_std` enum('unspsc','hs','cpc','eclss') NOT NULL COMMENT '本节点所属子树的主轴标准（单一主轴制，消除切分维度错配）',
  `axis_code` varchar(20) NOT NULL COMMENT '主轴标准内规范码：唯一权威落点，父子单调归属校验用',
  `merge_source` varchar(20) NOT NULL DEFAULT '' COMMENT '择优来源标记',
  `alias_of` varchar(64) NOT NULL DEFAULT '' COMMENT '被归并节点指向规范节点码（去重归并，绝不产生两个爹）',
  `attach_status` enum('pending','approved') NOT NULL DEFAULT 'pending' COMMENT '挂载人审态：pending 不进读路径/权益墙/索引（门禁 FU5）',
  `name_status` enum('pending','approved') NOT NULL DEFAULT 'pending' COMMENT '命名审核态',
  `name_zh` varchar(300) NOT NULL COMMENT '中文名',
  `name_en` varchar(300) NOT NULL DEFAULT '' COMMENT '英文名（供对账与缺中文兜底）',
  `sort` int NOT NULL DEFAULT 0 COMMENT '同父内稳定顺序',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用（停用不删行，保留历史归属）',
  `note` varchar(500) NOT NULL DEFAULT '' COMMENT '命名/挂载依据与待审点',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_parent` (`parent_code`),
  KEY `idx_group` (`group_code`),
  KEY `idx_level` (`level`),
  KEY `idx_axis` (`axis_std`,`axis_code`),
  KEY `idx_attach` (`attach_status`,`name_status`),
  FULLTEXT KEY `ft_fusion_names` (`name_zh`,`name_en`) /*!50100 WITH PARSER `ngram` */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='融合品目树(影子·单一融合树)';

-- 多标准映射账本（影子）：承载四家全量并集，并物理保证一码一爹
CREATE TABLE `crm_commodity_fusion_xwalk__new` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `node_code` varchar(64) NOT NULL COMMENT '融合节点码 UGT-…',
  `std` enum('unspsc','hs','cpc','eclss') NOT NULL COMMENT '标准来源',
  `std_code` varchar(20) NOT NULL COMMENT '该标准原始码（8位UNSPSC/6位HS/5位CPC/eCl@ss分类码）',
  `relation` enum('primary','alias') NOT NULL DEFAULT 'alias' COMMENT 'primary=主轴规范落点；alias=同义并入，不另起分支',
  `status` enum('pending','approved') NOT NULL DEFAULT 'pending' COMMENT '语义审核态：未过审不得用于归属',
  `note` varchar(300) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_one_dad` (`std`,`std_code`),  -- ★ 一码一爹：任一外部码只能归属一个融合节点（门禁 FU3）
  KEY `ix_node` (`node_code`),
  KEY `ix_status` (`std`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='融合树多标准映射账本';

-- 公告×融合节点倒排（影子）：与在用 crm_notice_backbone_nodes 并行，不覆盖
CREATE TABLE `crm_notice_fusion_backbone_nodes__new` (
  `notice_id` bigint unsigned NOT NULL COMMENT '公告主键 id',
  `node` varchar(64) NOT NULL COMMENT '融合节点码（字符集/排序与 fusion 表 code 一致，否则比较转列吃索引）',
  PRIMARY KEY (`notice_id`,`node`),
  KEY `idx_node` (`node`,`notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告×融合节点倒排(影子)';

-- 宽表增并行影子列（与在用 backbone_path/precise_backbone_path 互不覆盖）
ALTER TABLE `crm_notice_search`
  ADD COLUMN `fusion_backbone_path` mediumtext COMMENT '公告归属的融合节点码集（UGT-，含全部祖先，逗号分隔；由 fusion-path 换算）',
  ADD COLUMN `fusion_precise_backbone_path` mediumtext COMMENT 'approved 精准候选挂靠到的融合节点码集（UGT-，含全部祖先，逗号分隔）';
