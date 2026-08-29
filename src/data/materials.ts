/**
 * 学习资料静态数据
 * Learning Materials Static Data
 *
 * @module data/materials
 * @description 学习中心资料（含付费/免费）与研修班工具包（11 份下载素材）
 *              Learning center materials (premium + free) and training workshop toolkit files
 */

import type { LearningMaterial } from "@/types";

export const LEARNING_MATERIALS: LearningMaterial[] = [
  {
    id: "lm-01",
    titleZh: "联合国采购（国际公共采购）基础级别(Basic)与等级一级(Level 1)入驻新手实操指南",
    titleEn: "国际公共采购 Registration Guide: Step-by-Step Practical Blueprint for Basic & Level 1 Access",
    categoryZh: "国际公共采购入驻",
    categoryEn: "国际公共采购 Registration",
    summaryZh: "手把手教授如何整理企业资质材料、填写供应商财务申明和标准主营物料UNSPSC编码匹配。",
    summaryEn: "A comprehensive manual instruction instructing teams on QMS papers, preparing standard templates and mapping UNSPSC codes accurately.",
    contentZh: "此指南详细叙述：1. 中国商事主体三证合一证照中英翻译格式要求；2. 财务资产负债表一页模板；3. UNSPSC精确至细分项的匹配口径；4. 防范常见账户被拒被挂起关键要点。",
    contentEn: "Comprehensive instructions spanning: 1. Business registration English templates checklist; 2. Financial statement formats; 3. Mapping of multi-tiered UNSPSC categorizations; 4. Standard pitfalls to avoid registration delays.",
    isPremium: false,
    downloadsCount: 1420
  },
  {
    id: "lm-02",
    titleZh: "海外政府公共工程及难民署人道主义采购投标书（中英）经典范本与避坑要点",
    titleEn: "Overseas Public Procurement & UNHCR Bidding Templates (Chn/Eng) & Compliance Standard Case Studies",
    categoryZh: "政策解读",
    categoryEn: "Policy Guide",
    summaryZh: "精选近2年实际中标的公共设施、日用品集采投标文本，标注在合规承诺、不可抗力条款上的特殊用词。",
    summaryEn: "Compiles premium, winning public sector technical schedules and checklists, with deep-dive callouts on force majeure and ethical declaration statements.",
    contentZh: "包含正规合同样本、不可抗力声明信、劳工健康保障承诺声明中英格式，以及针对突发供应链运力中断时期的免责举证公函案例。",
    contentEn: "Contains full legal bidding specimens, worker health compliance templates, fair-wage pledges, and official indemnity declaration case studies to guard against downstream shipping disruptions.",
    isPremium: true,
    downloadsCount: 580
  },
  {
    id: "lm-03",
    titleZh: "海外实体国家级展厅'前展后仓'一站式直采协同网络部署及落地服务包指南",
    titleEn: "Physical Overseas Showrooms 'Front Exhibition, Rear Warehouse' One-stop Supply Grid Deployment Handbook",
    categoryZh: "参展指南",
    categoryEn: "Exhibition Guide",
    summaryZh: "介绍如何在保税区建立备品备件库，实现现场样品展示与同城24小时现货物流响应的协同模式。",
    summaryEn: "Explains standard operational procedures for bonding spare parts inside foreign custom free-zones, empowering seamless sample displays with same-day local shipping capabilities.",
    contentZh: "重点分析欧洲、中东、东南亚保税物流中转保税政策、常态样机通关减免规则，多区域展示大件货物清关周期预算表。",
    contentEn: "Contains policy breakdowns for bond logistics in Frankfurt, Dubai, and Saigon, alongside customs handling tariff exemption matrices for persistent sample machinery items.",
    isPremium: true,
    downloadsCount: 310
  }
];

export const TRAINING_DOWNLOAD_MATERIALS: LearningMaterial[] = [
  {
    id: "training-doc-01",
    titleZh: "UNGM中国供应商入驻指导白皮书",
    titleEn: "UNGM China Supplier Onboarding Whitepaper",
    categoryZh: "入驻指南",
    categoryEn: "Onboarding Guide",
    summaryZh: "系统梳理中国供应商入驻UNGM平台的完整流程，涵盖资质准备、账户注册、信息填写与审核要点。",
    summaryEn: "A comprehensive guide for Chinese suppliers to register on UNGM, covering credentials, account setup and review checkpoints.",
    contentZh: "包含：1. UNGM平台注册步骤详解；2. 企业资质材料清单；3. 财务申明填写规范；4. UNSPSC编码匹配指引；5. 常见驳回原因及应对。",
    contentEn: "Covers: 1. UNGM registration walkthrough; 2. Required credential checklist; 3. Financial statement standards; 4. UNSPSC code mapping; 5. Common rejection reasons.",
    isPremium: true,
    downloadsCount: 0,
    number: 1,
    price: 1.9,
    fileUrl: "/downloads/training/1-UNGM中国供应商入驻指导白皮书.pdf",
    fileName: "1-UNGM中国供应商入驻指导白皮书.pdf"
  },
  {
    id: "training-doc-02",
    titleZh: "UNGM供应商高级别入驻自测打分表",
    titleEn: "UNGM Supplier Advanced-Level Self-Assessment Scorecard",
    categoryZh: "自测评估",
    categoryEn: "Self-Assessment",
    summaryZh: "帮助供应商对照UNGM高级别入驻要求逐项自评，快速识别资质差距并制定补强计划。",
    summaryEn: "A self-assessment scorecard aligned with UNGM advanced-level requirements to identify qualification gaps.",
    contentZh: "涵盖：财务健康度、质量管理体系、环境与社会合规、过往业绩、技术能力等维度的打分标准与自评方法。",
    contentEn: "Covers scoring criteria across financial health, QMS, ESG compliance, track record and technical capability.",
    isPremium: true,
    downloadsCount: 0,
    number: 2,
    price: 3.9,
    fileUrl: "/downloads/training/2-UNGM供应商高级别入驻自测打分表.pdf",
    fileName: "2-UNGM供应商高级别入驻自测打分表.pdf"
  },
  {
    id: "training-doc-03",
    titleZh: "联合国采购供应商注册指南（保姆级）",
    titleEn: "UN Procurement Supplier Registration Guide (Step-by-Step)",
    categoryZh: "注册指南",
    categoryEn: "Registration Guide",
    summaryZh: "从零开始手把手指导完成UNGM基础级（Basic Level）开户与注册全流程，适合零基础企业。",
    summaryEn: "A zero-to-finish walkthrough for UNGM Basic Level account creation, ideal for first-time registrants.",
    contentZh: "包含：UNGM基础级开户步骤、所需材料清单、在线填写注意事项、审核等待期应对、账户激活后操作指南。",
    contentEn: "Includes: UNGM Basic Level account steps, required documents, online form tips, review waiting period and post-activation guide.",
    isPremium: true,
    downloadsCount: 0,
    number: 3,
    price: 19.9,
    fileUrl: "/downloads/training/3-联合国采购供应商注册指南（UNGM基础级（Basic Level）保姆级开户与注册指南）.zip",
    fileName: "3-联合国采购供应商注册指南（保姆级）.zip"
  },
  {
    id: "training-doc-04",
    titleZh: "联采从业人员工作手册（中文版）",
    titleEn: "Joint Procurement Practitioner's Handbook (Chinese)",
    categoryZh: "工作手册",
    categoryEn: "Handbook",
    summaryZh: "面向联采从业人员的中文实操手册，覆盖采购流程、合规要求、投标技巧和案例分析。",
    summaryEn: "Chinese-language practical handbook for procurement practitioners covering process, compliance, bidding and cases.",
    contentZh: "内容涵盖：采购方式选择、招标文件解读、投标策略、合同管理、履约风险控制等核心模块。",
    contentEn: "Covers procurement method selection, tender document analysis, bidding strategy, contract management and delivery risk control.",
    isPremium: true,
    downloadsCount: 0,
    number: 4,
    price: 5.9,
    fileUrl: "/downloads/training/4-UN Procurement Practitioners Handbook 中文版 May 2022pdf1(1)(1).pdf",
    fileName: "4-联采从业人员工作手册（中文版）.pdf"
  },
  {
    id: "training-doc-05",
    titleZh: "联采从业人员工作手册（英文版）",
    titleEn: "Joint Procurement Practitioner's Handbook (English)",
    categoryZh: "工作手册",
    categoryEn: "Handbook",
    summaryZh: "UN采购从业人员英文原版工作手册，适合需要直接阅读英文采购规则的企业团队。",
    summaryEn: "Original English-language UN procurement handbook for teams working directly with English procurement rules.",
    contentZh: "英文原版内容，涵盖采购全流程操作规范、合规框架、最佳实践案例。与中文版内容对应。",
    contentEn: "Original English content covering full procurement process standards, compliance framework and best practice cases.",
    isPremium: true,
    downloadsCount: 0,
    number: 5,
    price: 5.9,
    fileUrl: "/downloads/training/5-UN Procurement Practitioner's Handbook-version26 Feb 2022 (2)(1).pdf",
    fileName: "5-联采从业人员工作手册（英文版）.pdf"
  },
  {
    id: "training-doc-06",
    titleZh: "联合国秘书处业务合作指南 中英双语版",
    titleEn: "UN Secretariat Business Cooperation Guide (Bilingual)",
    categoryZh: "合作指南",
    categoryEn: "Cooperation Guide",
    summaryZh: "联合国秘书处与私营部门业务合作的中英双语指南，帮助供应商了解合作模式与准入要求。",
    summaryEn: "Bilingual guide on UN Secretariat private-sector cooperation, helping suppliers understand partnership models and entry requirements.",
    contentZh: "包含：合作框架概述、供应商准入条件、采购流程说明、合同类型与付款条款、合规与道德准则。",
    contentEn: "Covers cooperation framework, supplier entry criteria, procurement process, contract types, payment terms and ethics guidelines.",
    isPremium: true,
    downloadsCount: 0,
    number: 6,
    price: 9.9,
    fileUrl: "/downloads/training/5-Doing Business with UN.indd(1)_bilingual.pdf",
    fileName: "6-联合国秘书处业务合作指南 中英双语版.pdf"
  },
  {
    id: "training-doc-07",
    titleZh: "联合国采购行业报告（2024-2025年）",
    titleEn: "UN Procurement Industry Report (2024-2025)",
    categoryZh: "行业报告",
    categoryEn: "Industry Report",
    summaryZh: "汇总2024-2025年联合国采购行业趋势、各机构采购数据、热门品类与中标分析。",
    summaryEn: "Aggregates 2024-2025 UN procurement trends, agency-level data, hot categories and award analysis.",
    contentZh: "包含2024年度和2025年度两份ASR报告，涵盖各机构采购金额、品类分布、地区分布和供应商中标情况。",
    contentEn: "Includes 2024 and 2025 ASR reports with agency procurement amounts, category distribution, regional breakdown and supplier awards.",
    isPremium: true,
    downloadsCount: 0,
    number: 7,
    price: 29.9,
    fileUrl: "/downloads/training/7-联合国采购行业报告（2024-2025年）.zip",
    fileName: "7-联合国采购行业报告（2024-2025年）.zip"
  },
  {
    id: "training-doc-08",
    titleZh: "联采投标全流程自助表格",
    titleEn: "Joint Procurement Bidding Self-Service Toolkit",
    categoryZh: "投标工具",
    categoryEn: "Bidding Toolkit",
    summaryZh: "覆盖联采投标全流程的自助表格合集，从需求分析到标书编制一站式工具包。",
    summaryEn: "A self-service toolkit covering the full bidding process from needs analysis to bid document preparation.",
    contentZh: "包含：需求分析表、竞争对手分析表、报价核算表、技术响应矩阵、商务偏离表、投标检查清单等。",
    contentEn: "Includes needs analysis, competitor analysis, cost calculation, technical response matrix, commercial deviation table and bid checklist.",
    isPremium: true,
    downloadsCount: 0,
    number: 8,
    price: 59.9,
    fileUrl: "/downloads/training/8-联采投标全流程自助表格.zip",
    fileName: "8-联采投标全流程自助表格.zip"
  }
];

/** 资料打包价格配置 */
export const TRAINING_MATERIAL_BUNDLES = [
  {
    id: "bundle-4-5",
    labelZh: "资料4-5打包（联采从业人员工作手册 中英双语）",
    labelEn: "Bundle: Items 4-5 (Practitioner's Handbook CN+EN)",
    includesIds: ["training-doc-04", "training-doc-05"],
    price: 12.9,
  },
  {
    id: "bundle-all",
    labelZh: "资料1-8全套打包",
    labelEn: "Bundle: All 8 Materials",
    includesIds: ["training-doc-01", "training-doc-02", "training-doc-03", "training-doc-04", "training-doc-05", "training-doc-06", "training-doc-07", "training-doc-08"],
    price: 99,
  },
] as const;
