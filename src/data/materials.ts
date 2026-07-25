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
    titleZh: "1-采购形式判断卡",
    titleEn: "1 - Procurement Form Judgement Card",
    categoryZh: "研修班工具",
    categoryEn: "Workshop Toolkit",
    summaryZh: "用于快速判断项目适合公开招标、询价、框架协议或其他采购方式，帮助企业在前期选对响应路径。",
    summaryEn: "A quick worksheet for choosing the right procurement approach before committing bid resources.",
    contentZh: "适用场景：采购需求初筛、客户沟通前准备、项目响应方式判断。建议在收到采购线索后先填写本卡。",
    contentEn: "Use it for early lead review, buyer conversations and procurement route decisions.",
    isPremium: false,
    downloadsCount: 128,
    fileUrl: "/downloads/training/01-procurement-form-judgement-card.docx",
    fileName: "1-采购形式判断卡.docx"
  },
  {
    id: "training-doc-02",
    titleZh: "2-采购官10问",
    titleEn: "2 - Ten Questions from Procurement Officers",
    categoryZh: "访谈准备",
    categoryEn: "Buyer Interview",
    summaryZh: "整理采购官常问的 10 个关键问题，帮助销售、投标和管理层提前统一回答口径。",
    summaryEn: "Ten practical buyer questions for aligning sales, bid and leadership responses.",
    contentZh: "适用场景：采购官访谈、展会洽谈、线上答疑、标前澄清准备。可作为团队内部演练提纲。",
    contentEn: "Use it for buyer interviews, trade-show conversations and pre-bid clarification rehearsals.",
    isPremium: false,
    downloadsCount: 96,
    fileUrl: "/downloads/training/02-procurement-officer-10-questions.docx",
    fileName: "2-采购官10问.docx"
  },
  {
    id: "training-doc-03",
    titleZh: "3-供应商履约能力自检表",
    titleEn: "3 - Supplier Performance Capability Checklist",
    categoryZh: "履约自检",
    categoryEn: "Delivery Readiness",
    summaryZh: "围绕产能、资质、交期、质量和售后能力做自查，判断企业是否具备承接国际采购订单的基础条件。",
    summaryEn: "A readiness checklist covering capacity, credentials, lead time, quality and service capability.",
    contentZh: "适用场景：报名研修班前自评、进入供应商库前准备、投标前内部复盘。",
    contentEn: "Use it before training, supplier onboarding or a bid-readiness review.",
    isPremium: false,
    downloadsCount: 112,
    fileUrl: "/downloads/training/03-supplier-performance-capability-checklist.docx",
    fileName: "3-供应商履约能力自检表.docx"
  },
  {
    id: "training-doc-04",
    titleZh: "4-合同与交付风险清单",
    titleEn: "4 - Contract and Delivery Risk Checklist",
    categoryZh: "风险控制",
    categoryEn: "Risk Control",
    summaryZh: "从合同条款、付款节点、交货责任、验收标准和违约风险等维度梳理项目风险。",
    summaryEn: "A contract and delivery risk checklist for payment, acceptance and liability review.",
    contentZh: "适用场景：合同评审、报价前风险核算、供应链与法务协同检查。",
    contentEn: "Use it before quotation and contract review to surface delivery, payment and acceptance risks.",
    isPremium: false,
    downloadsCount: 88,
    fileUrl: "/downloads/training/04-contract-delivery-risk-checklist.docx",
    fileName: "4-合同与交付风险清单.docx"
  },
  {
    id: "training-doc-05",
    titleZh: "5-UN采购机会卡",
    titleEn: "5 - UN Procurement Opportunity Card",
    categoryZh: "机会分析",
    categoryEn: "Opportunity Review",
    summaryZh: "将联合国采购机会拆解为需求、预算、资质、时间线、竞争态势和下一步动作。",
    summaryEn: "A one-page opportunity card for UN procurement leads, budgets, timelines and next steps.",
    contentZh: "适用场景：采购机会池筛选、销售会议、企业内部立项判断。",
    contentEn: "Use it to qualify UN procurement opportunities and align the next action owner.",
    isPremium: false,
    downloadsCount: 101,
    fileUrl: "/downloads/training/05-un-procurement-opportunity-card.docx",
    fileName: "5-UN采购机会卡.docx"
  },
  {
    id: "training-doc-06",
    titleZh: "6-强制文件清单",
    titleEn: "6 - Mandatory Document Checklist",
    categoryZh: "文件准备",
    categoryEn: "Document Prep",
    summaryZh: "汇总投标和供应商注册阶段常见的强制材料，便于企业逐项检查缺口。",
    summaryEn: "A mandatory document checklist for supplier registration and bid preparation.",
    contentZh: "适用场景：资料包准备、标书附件核对、供应商档案完善。",
    contentEn: "Use it to keep qualification files, bid attachments and supplier records complete.",
    isPremium: false,
    downloadsCount: 119,
    fileUrl: "/downloads/training/06-mandatory-document-checklist.docx",
    fileName: "6-强制文件清单.docx"
  },
  {
    id: "training-doc-07",
    titleZh: "7-技术响应矩阵",
    titleEn: "7 - Technical Response Matrix",
    categoryZh: "技术响应",
    categoryEn: "Technical Response",
    summaryZh: "用于逐条对照招标技术要求、企业响应内容、证明材料和偏离说明。",
    summaryEn: "A response matrix for matching technical requirements with evidence and deviations.",
    contentZh: "适用场景：技术标编制、需求偏离分析、证明文件索引。",
    contentEn: "Use it when drafting technical submissions and managing evidence references.",
    isPremium: false,
    downloadsCount: 135,
    fileUrl: "/downloads/training/07-technical-response-matrix.docx",
    fileName: "7-技术响应矩阵.docx"
  },
  {
    id: "training-doc-08",
    titleZh: "8-报价成本核算表",
    titleEn: "8 - Quotation Cost Calculation Sheet",
    categoryZh: "报价测算",
    categoryEn: "Costing",
    summaryZh: "帮助企业拆分产品、运输、认证、保险、税费、服务和风险缓冲，形成更稳健的报价。",
    summaryEn: "A costing worksheet for product, logistics, certification, insurance, tax and contingency.",
    contentZh: "适用场景：报价前测算、利润复核、不同交付条款下的成本比较。",
    contentEn: "Use it to validate margins and compare cost assumptions across delivery terms.",
    isPremium: false,
    downloadsCount: 124,
    fileUrl: "/downloads/training/08-quotation-cost-calculation-sheet.docx",
    fileName: "8-报价成本核算表.docx"
  },
  {
    id: "training-doc-09",
    titleZh: "9-供应商就绪度评估表",
    titleEn: "9 - Supplier Readiness Assessment",
    categoryZh: "能力评估",
    categoryEn: "Readiness Assessment",
    summaryZh: "从组织、产品、合规、交付、语言和商务响应能力评估企业进入国际采购市场的就绪程度。",
    summaryEn: "A structured supplier readiness assessment across organization, product, compliance and delivery.",
    contentZh: "适用场景：研修班课前评估、供应商分层、后续辅导计划制定。",
    contentEn: "Use it before training or advisory work to identify supplier enablement priorities.",
    isPremium: false,
    downloadsCount: 93,
    fileUrl: "/downloads/training/09-supplier-readiness-assessment.docx",
    fileName: "9-供应商就绪度评估表.docx"
  },
  {
    id: "training-doc-10",
    titleZh: "10-会后30天行动计划",
    titleEn: "10 - Post-event 30-day Action Plan",
    categoryZh: "行动计划",
    categoryEn: "Action Plan",
    summaryZh: "把研修班后的资料整理、平台注册、机会筛选、团队分工和跟进节奏拆成 30 天行动表。",
    summaryEn: "A 30-day action plan for turning workshop learning into concrete execution.",
    contentZh: "适用场景：会后复盘、管理层汇报、团队执行追踪。",
    contentEn: "Use it after the workshop to assign owners, deadlines and measurable progress.",
    isPremium: false,
    downloadsCount: 76,
    fileUrl: "/downloads/training/10-post-event-30-day-action-plan.docx",
    fileName: "10-会后30天行动计划.docx"
  },
  {
    id: "training-doc-11",
    titleZh: "11-联合意向表",
    titleEn: "11 - Joint Intention Form",
    categoryZh: "合作意向",
    categoryEn: "Cooperation Intent",
    summaryZh: "用于记录企业参与联合采购、供应商库、海外展厅或后续辅导服务的初步合作意向。",
    summaryEn: "An intent form for joint procurement, supplier onboarding, showrooms and advisory services.",
    contentZh: "适用场景：会后合作登记、顾问跟进、企业需求归档。",
    contentEn: "Use it to record follow-up intent and keep advisory conversations organized.",
    isPremium: false,
    downloadsCount: 82,
    fileUrl: "/downloads/training/11-joint-intention-form.docx",
    fileName: "11-联合意向表.docx"
  }
];
