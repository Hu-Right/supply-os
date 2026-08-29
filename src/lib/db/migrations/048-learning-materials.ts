/**
 * 048: 学习资料表
 * learning-materials
 *
 * 将学习资料元数据从静态 TS 文件迁移至数据库，支持后台管理动态增删改。
 * 同时插入种子数据（幂等 INSERT IGNORE）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 48,
  name: "learning-materials",
  async up(dbPool: Pool) {
    // ── 表结构 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_learning_materials (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        material_id VARCHAR(64) NOT NULL COMMENT '资料唯一标识（如 training-doc-01）',
        title_zh VARCHAR(255) NOT NULL,
        title_en VARCHAR(255) NOT NULL DEFAULT '',
        content_zh TEXT,
        content_en TEXT,
        category_zh VARCHAR(64) NOT NULL DEFAULT '',
        category_en VARCHAR(64) NOT NULL DEFAULT '',
        summary_zh VARCHAR(500) NOT NULL DEFAULT '',
        summary_en VARCHAR(500) NOT NULL DEFAULT '',
        price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '单价（元）',
        file_url VARCHAR(500) NOT NULL DEFAULT '' COMMENT '静态文件路径',
        file_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '下载文件名',
        downloads_count INT UNSIGNED NOT NULL DEFAULT 0,
        is_premium TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否付费',
        number INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '展示编号',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_material_id (material_id),
        INDEX idx_category (category_zh),
        INDEX idx_number (number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习资料表'
    `);

    // ── 种子数据（幂等） ──
    await dbPool.query(`
      INSERT IGNORE INTO crm_learning_materials
        (material_id, title_zh, title_en, category_zh, category_en, summary_zh, summary_en,
         content_zh, content_en, price, file_url, file_name, downloads_count, is_premium, number)
      VALUES
        ('training-doc-01', 'UNGM中国供应商入驻指导白皮书', 'UNGM China Supplier Onboarding Whitepaper',
         '入驻指南', 'Onboarding Guide',
         '系统梳理中国供应商入驻UNGM平台的完整流程，涵盖资质准备、账户注册、信息填写与审核要点。',
         'A comprehensive guide for Chinese suppliers to register on UNGM, covering credentials, account setup and review checkpoints.',
         '包含：1. UNGM平台注册步骤详解；2. 企业资质材料清单；3. 财务申明填写规范；4. UNSPSC编码匹配指引；5. 常见驳回原因及应对。',
         'Covers: 1. UNGM registration walkthrough; 2. Required credential checklist; 3. Financial statement standards; 4. UNSPSC code mapping; 5. Common rejection reasons.',
         1.9, '/downloads/training/1-UNGM中国供应商入驻指导白皮书.pdf', '1-UNGM中国供应商入驻指导白皮书.pdf', 0, 1, 1),

        ('training-doc-02', 'UNGM供应商高级别入驻自测打分表', 'UNGM Supplier Advanced-Level Self-Assessment Scorecard',
         '自测评估', 'Self-Assessment',
         '帮助供应商对照UNGM高级别入驻要求逐项自评，快速识别资质差距并制定补强计划。',
         'A self-assessment scorecard aligned with UNGM advanced-level requirements to identify qualification gaps.',
         '涵盖：财务健康度、质量管理体系、环境与社会合规、过往业绩、技术能力等维度的打分标准与自评方法。',
         'Covers scoring criteria across financial health, QMS, ESG compliance, track record and technical capability.',
         3.9, '/downloads/training/2-UNGM供应商高级别入驻自测打分表.pdf', '2-UNGM供应商高级别入驻自测打分表.pdf', 0, 1, 2),

        ('training-doc-03', '联合国采购供应商注册指南（保姆级）', 'UN Procurement Supplier Registration Guide (Step-by-Step)',
         '注册指南', 'Registration Guide',
         '从零开始手把手指导完成UNGM基础级（Basic Level）开户与注册全流程，适合零基础企业。',
         'A zero-to-finish walkthrough for UNGM Basic Level account creation, ideal for first-time registrants.',
         '包含：UNGM基础级开户步骤、所需材料清单、在线填写注意事项、审核等待期应对、账户激活后操作指南。',
         'Includes: UNGM Basic Level account steps, required documents, online form tips, review waiting period and post-activation guide.',
         19.9, '/downloads/training/3-联合国采购供应商注册指南（UNGM基础级（Basic Level）保姆级开户与注册指南）.zip', '3-联合国采购供应商注册指南（保姆级）.zip', 0, 1, 3),

        ('training-doc-04', '联采从业人员工作手册（中文版）', 'Joint Procurement Practitioner''s Handbook (Chinese)',
         '工作手册', 'Handbook',
         '面向联采从业人员的中文实操手册，覆盖采购流程、合规要求、投标技巧和案例分析。',
         'Chinese-language practical handbook for procurement practitioners covering process, compliance, bidding and cases.',
         '内容涵盖：采购方式选择、招标文件解读、投标策略、合同管理、履约风险控制等核心模块。',
         'Covers procurement method selection, tender document analysis, bidding strategy, contract management and delivery risk control.',
         5.9, '/downloads/training/4-UN Procurement Practitioners Handbook 中文版 May 2022pdf1(1)(1).pdf', '4-联采从业人员工作手册（中文版）.pdf', 0, 1, 4),

        ('training-doc-05', '联采从业人员工作手册（英文版）', 'Joint Procurement Practitioner''s Handbook (English)',
         '工作手册', 'Handbook',
         'UN采购从业人员英文原版工作手册，适合需要直接阅读英文采购规则的企业团队。',
         'Original English-language UN procurement handbook for teams working directly with English procurement rules.',
         '英文原版内容，涵盖采购全流程操作规范、合规框架、最佳实践案例。与中文版内容对应。',
         'Original English content covering full procurement process standards, compliance framework and best practice cases.',
         5.9, '/downloads/training/5-UN Procurement Practitioner''s Handbook-version26 Feb 2022 (2)(1).pdf', '5-联采从业人员工作手册（英文版）.pdf', 0, 1, 5),

        ('training-doc-06', '联合国秘书处业务合作指南 中英双语版', 'UN Secretariat Business Cooperation Guide (Bilingual)',
         '合作指南', 'Cooperation Guide',
         '联合国秘书处与私营部门业务合作的中英双语指南，帮助供应商了解合作模式与准入要求。',
         'Bilingual guide on UN Secretariat private-sector cooperation, helping suppliers understand partnership models and entry requirements.',
         '包含：合作框架概述、供应商准入条件、采购流程说明、合同类型与付款条款、合规与道德准则。',
         'Covers cooperation framework, supplier entry criteria, procurement process, contract types, payment terms and ethics guidelines.',
         9.9, '/downloads/training/5-Doing Business with UN.indd(1)_bilingual.pdf', '6-联合国秘书处业务合作指南 中英双语版.pdf', 0, 1, 6),

        ('training-doc-07', '联合国采购行业报告（2024-2025年）', 'UN Procurement Industry Report (2024-2025)',
         '行业报告', 'Industry Report',
         '汇总2024-2025年联合国采购行业趋势、各机构采购数据、热门品类与中标分析。',
         'Aggregates 2024-2025 UN procurement trends, agency-level data, hot categories and award analysis.',
         '包含2024年度和2025年度两份ASR报告，涵盖各机构采购金额、品类分布、地区分布和供应商中标情况。',
         'Includes 2024 and 2025 ASR reports with agency procurement amounts, category distribution, regional breakdown and supplier awards.',
         29.9, '/downloads/training/7-联合国采购行业报告（2024-2025年）.zip', '7-联合国采购行业报告（2024-2025年）.zip', 0, 1, 7),

        ('training-doc-08', '联采投标全流程自助表格', 'Joint Procurement Bidding Self-Service Toolkit',
         '投标工具', 'Bidding Toolkit',
         '覆盖联采投标全流程的自助表格合集，从需求分析到标书编制一站式工具包。',
         'A self-service toolkit covering the full bidding process from needs analysis to bid document preparation.',
         '包含：需求分析表、竞争对手分析表、报价核算表、技术响应矩阵、商务偏离表、投标检查清单等。',
         'Includes needs analysis, competitor analysis, cost calculation, technical response matrix, commercial deviation table and bid checklist.',
         59.9, '/downloads/training/8-联采投标全流程自助表格.zip', '8-联采投标全流程自助表格.zip', 0, 1, 8)
    `);
  },
};
