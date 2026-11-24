/**
 * 供应商投标能力诊断 v2 —— 维度、题目与算分映射的唯一事实源
 * Supplier Bid-Capability Diagnosis v2 — dimension / question / scoring SSOT
 *
 * @module shared/constants/diagnosis-dimensions
 * @description 口径来自 docs/superpowers/specs/2026-09-24-供应商诊断表统一规范设计.md
 *              §4.1（题面与选项）与 §8.4（算分规则）。三条不可违反的规范在这里落地：
 *              N3 一个字段只服务一个维度（禁止跨维度复用）；
 *              选项顺序即得分档，映射逐题显式声明，不留默认值与「未选即最高」路径；
 *              选项中文原文入库（与 v1 一致），题面标签走 i18n 键，选项值不入 i18n。
 *              写入与比较一律引用本文件常量，禁止在别处出现裸字符串。
 */

export type DiagnosisFieldKind = "single" | "multi" | "text";

/** 计项分档：命中 min 及以上取该项 score（bands 必须按 min 降序或升序一致声明） */
export interface DiagnosisBand {
  min: number;
  score: number;
}

export interface DiagnosisFieldDef {
  /** 前端表单字段名 = 数据库列名（snake_case，一一对应） */
  key: string;
  column: string;
  /** 归属维度号；0 = 不参与评分的意向标记 / 资质完善输入 */
  dimensionNo: number;
  kind: DiagnosisFieldKind;
  /** i18n 题面键前缀，见 locales 各语 procurement.json 的 diagQ 系列键 */
  labelKey: string;
  /** 中文题面：服务端生成 PDF 报告时无 i18n 上下文，直接用本字段（页面渲染仍走 labelKey） */
  labelZh: string;
  /** single / multi 必填：由低到高有序 */
  options?: readonly string[];
  /**
   * V3：选项的 i18n 标签键（与 options 等长）。不填则「显示值 == 存储值」（V2 既有不变式）；
   * 填了意味着入库仍是 code、界面显示本地化名（目标市场这类「码值对人不可读」的题必须走这条）。
   */
  optionLabelKeys?: readonly string[];
  /** single 必填：与 options 等长，值域 0-5 */
  scoreMap?: readonly number[];
  /** multi / text 必填：按计入项数分档 */
  bands?: readonly DiagnosisBand[];
  /**
   * V3：是否在表单中提问。`false` = 列与契约保留、表单不再询问
   * （`bid_willingness` 即此形态：列仍被 AI 画像契约读取，提交即视为意愿，不排除用户选择）。
   */
  askInForm?: boolean;
  /**
   * V3：是否选答。资格必答项（dimensionNo=0 与 export_entity）恒必答；
   * 能力画像（维度 2–10）全部选答——不答则 100 分能力等级标"未评估"，不阻塞提交。
   */
  optional?: boolean;
  /**
   * 多选/文本题的必填标记。单选题天然必答（不走这个字段）；
   * 多选默认允许空选（语义是"一项都没有"），只有显式 `required: true` 才要求至少选一项
   * ——`target_markets` 就是这样：不选市场，报告无法比对准入要求。
   */
  required?: boolean;
}

export interface DiagnosisDimensionDef {
  no: number;
  name: string;
  nameEn: string;
  weight: number;
  /** 该维度独占的字段；同一字段不得出现在两个维度 */
  fields: readonly string[];
}

// ── 10 个评估维度（权重合计 100，沿用官方就绪度评分表维度名） ──

export const DIAGNOSIS_DIMENSIONS: readonly DiagnosisDimensionDef[] = [
  { no: 1, name: "国际供应商档案就绪度", nameEn: "International vendor profile readiness", weight: 10, fields: ["export_entity"] },
  { no: 2, name: "英文证据库可调用性", nameEn: "English evidence library usability", weight: 10, fields: ["english_evidence_level", "english_meeting_capability"] },
  { no: 3, name: "标书拆解与投标决策能力", nameEn: "Tender decoding and bid-decision capability", weight: 10, fields: ["tender_experience", "tender_amount_band", "procurement_frameworks"] },
  { no: 4, name: "资质与文件管理能力", nameEn: "Qualification and document management", weight: 10, fields: ["cert_ledger", "cert_delivery"] },
  { no: 5, name: "合规治理与风险升级机制", nameEn: "Compliance governance and escalation", weight: 10, fields: ["ungm_status", "compliance_governance"] },
  { no: 6, name: "技术响应与方案证明能力", nameEn: "Technical response and evidence capability", weight: 15, fields: ["technical_response"] },
  { no: 7, name: "完整成本与报价决策能力", nameEn: "Full-cost pricing and bid-decision capability", weight: 15, fields: ["cost_pricing", "incoterms_capability", "payment_terms", "export_scale"] },
  { no: 8, name: "最终审核与提交控制能力", nameEn: "Final review and submission control", weight: 10, fields: ["submission_control"] },
  { no: 9, name: "履约组织与服务保障能力", nameEn: "Delivery organization and service assurance", weight: 5, fields: ["deliver_to_site", "service_countries", "overseas_companies"] },
  { no: 10, name: "投标团队、语言与CRM执行纪律", nameEn: "Bid team, language and CRM execution discipline", weight: 5, fields: ["team_discipline"] },
];

// ── V2 的 19 题答案字段（14 单选 + 2 多选 + 2 文本 + 1 意向标记）──
// V3 起：「投标意愿」不再提问（askInForm: false，列保留给 AI 画像契约），
// 新增的「目标市场」在下方 DIAGNOSIS_QUAL_FIELDS 里，不进本数组 → V2 列清单与评分口径不变。

export const DIAGNOSIS_FIELDS: readonly DiagnosisFieldDef[] = [
  // D1 主体资格（V3 新增；D1 的档案分仍由 supplier.data_quality_score 派生，本项与档案分取平均）
  {
    key: "export_entity", column: "export_entity", dimensionNo: 1, kind: "single",
    labelKey: "diagQExportEntity",
    labelZh: "是否具备出口主体资质（经营权 / 海关备案 / 外汇账户 / 退税）？",
    options: ["都没有", "有进出口经营权", "经营权 + 海关备案", "上述齐备且实际出口过"],
    scoreMap: [0, 2, 4, 5],
  },
  // D2 英文证据库
  {
    key: "english_evidence_level", column: "english_evidence_level", dimensionNo: 2, kind: "single",
    labelKey: "diagQEnglishEvidenceLevel",
    labelZh: "目前能即时提供的英文投标资料到什么程度？",
    options: ["无英文资料", "仅英文产品页与目录", "有英文检测报告或业绩证明", "上述齐全且有英文标书素材", "全套齐备且有可引用案例库"],
    scoreMap: [0, 1, 3, 4, 5],
  },
  {
    key: "english_meeting_capability", column: "english_meeting_capability", dimensionNo: 2, kind: "single",
    labelKey: "diagQEnglishMeetingCapability",
    labelZh: "能否用英文独立参加供应商答疑会 / 视频澄清会？",
    options: ["需全程翻译陪同", "仅书面往来", "可邮件与表单独立答疑", "可独立参与视频澄清会"],
    scoreMap: [0, 2, 4, 5],
  },
  // D3 标书拆解与投标决策
  {
    key: "tender_experience", column: "tender_experience", dimensionNo: 3, kind: "single",
    labelKey: "diagQTenderExperience",
    labelZh: "近 24 个月参与国际公共采购投标的实际情况？",
    options: ["从未参与国际公采投标", "参与过但未通过资格预审", "通过资审但未入围", "入围但未中标", "有中标记录"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  {
    key: "tender_amount_band", column: "tender_amount_band", dimensionNo: 3, kind: "single",
    labelKey: "diagQTenderAmountBand",
    labelZh: "最近一次投标的金额量级？",
    options: ["未参与", "10万美元以下", "10万至50万美元", "50万至200万美元", "200万美元以上"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  {
    key: "procurement_frameworks", column: "procurement_frameworks", dimensionNo: 3, kind: "multi",
    labelKey: "diagQProcurementFrameworks",
    labelZh: "熟悉哪套采购文件体系？（可多选）",
    options: ["UNGM 联合国采购门户", "世界银行 GPF", "欧盟 TED", "联合国机构直接采购", "其他政府援建项目"],
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 2, score: 3 }, { min: 3, score: 4 }, { min: 4, score: 5 }],
  },
  // D4 资质与文件管理能力（V3 2026-11-23：原「强制文件控制能力」换题）
  // 原 mandatory_docs 问的是「持有」（营业执照/ISO/检测报告/原产地证…），已撤下表单：
  // 持有信息改由能力档案的证书 code + 市场要求目录逐条判定（见 qual_breakdown），
  // 列保留给 AI 画像契约（askInForm:false，值落空串，不影响旧报告）。
  {
    key: "cert_ledger", column: "cert_ledger", dimensionNo: 4, kind: "single",
    labelKey: "diagQCertLedger",
    labelZh: "资质台账与有效期管理到什么程度？",
    options: ["无台账，证书散落在个人手里", "有台账但靠人记，没有到期提醒", "有台账且有到期提醒", "有台账、到期提醒、明确责任人，且每年复核一次"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "cert_delivery", column: "cert_delivery", dimensionNo: 4, kind: "single",
    labelKey: "diagQCertDelivery",
    labelZh: "被要求时，多久能交出一张证书（含英文版 / 扫描件）？",
    options: ["一周以上才能凑齐", "2–3 天", "当天可交", "2 小时内可交，且有英文版 / 扫描件模板"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "mandatory_docs", column: "mandatory_docs", dimensionNo: 4, kind: "multi",
    labelKey: "diagQMandatoryDocs",
    labelZh: "以下强制文件你能即时提供哪些？（V3 起不再询问）",
    options: ["营业执照英文版", "ISO体系证书", "第三方检测报告", "原产地证", "已交付业绩证明", "无商业犯罪声明", "银行资信证明", "童工与环保声明"],
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 3, score: 3 }, { min: 5, score: 4 }, { min: 7, score: 5 }],
    askInForm: false,
  },
  // D5 合规治理与风险升级
  {
    key: "ungm_status", column: "ungm_status", dimensionNo: 5, kind: "single",
    labelKey: "diagQUngmStatus",
    labelZh: "UNGM（联合国全球采购门户）注册状态？",
    options: ["未注册", "已注册基础级(Basic)", "已注册一级(Level 1)", "已注册二级(Level 2)"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "compliance_governance", column: "compliance_governance", dimensionNo: 5, kind: "single",
    labelKey: "diagQComplianceGovernance",
    labelZh: "合规制度覆盖了哪些内容（制裁筛查 / 反腐败 / 培训 / 尽调）？",
    options: ["无合规制度", "仅反腐败制度", "仅制裁与出口管制筛查", "两者都有并年度培训", "两者都有 + 培训 + 第三方尽调"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  // D6 技术响应与方案证明
  {
    key: "technical_response", column: "technical_response", dimensionNo: 6, kind: "single",
    labelKey: "diagQTechnicalResponse",
    labelZh: "能否按标书逐条出技术响应表并附证明？",
    options: ["不能逐条应答", "仅销售口头应答", "有技术团队可逐条应答", "有专用响应模板与案例库", "有3个以上政府或国际组织已交付案例"],
    scoreMap: [0, 1, 3, 4, 5],
  },
  // D7 完整成本与报价决策
  {
    key: "cost_pricing", column: "cost_pricing", dimensionNo: 7, kind: "single",
    labelKey: "diagQCostPricing",
    labelZh: "报价时成本如何核算（是否含关税 / VAT）？",
    options: ["凭经验估算", "有内部成本表", "含汇率、物流与账期资金成本", "含汇率物流账期与关税 / VAT", "有专职报价岗并复核"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  {
    key: "incoterms_capability", column: "incoterms_capability", dimensionNo: 7, kind: "single",
    labelKey: "diagQIncotermsCapability",
    labelZh: "多贸易条款（FOB/CIF/DDP）报价能力？",
    options: ["只会FOB", "会FOB与CIF", "三种贸易条款都会", "三种都会且能报目的国清关与内陆运输"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "payment_terms", column: "payment_terms", dimensionNo: 7, kind: "single",
    labelKey: "diagQPaymentTerms",
    labelZh: "是否接受 30 天以上国际账期？",
    options: ["不可以", "可以"],
    scoreMap: [1, 5],
  },
  {
    key: "export_scale", column: "export_scale", dimensionNo: 7, kind: "single",
    labelKey: "diagQExportScale",
    labelZh: "近 2 年出口 / 国际业务规模？",
    options: ["尚未出口", "500万美元以下", "500-2000万美元", "2000万美元以上"],
    scoreMap: [1, 2, 4, 5],
  },
  // D8 最终审核与提交控制
  {
    key: "submission_control", column: "submission_control", dimensionNo: 8, kind: "single",
    labelKey: "diagQSubmissionControl",
    labelZh: "标书提交前的复核流程？",
    options: ["无人复核", "编制人自审", "双人复核", "授权签字且用提交检查单"],
    scoreMap: [0, 2, 4, 5],
  },
  // D9 履约组织与服务保障
  {
    key: "deliver_to_site", column: "deliver_to_site", dimensionNo: 9, kind: "single",
    labelKey: "diagQDeliverToSite",
    labelZh: "能否交付至项目现场国？",
    options: ["不可", "经第三国", "可直接发货至项目国", "可发货且有本地代理"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "service_countries", column: "service_countries", dimensionNo: 9, kind: "text",
    labelKey: "diagQServiceCountries",
    labelZh: "有售后点 / 服务站 / 维修点的国家（逗号分隔）",
    bands: [{ min: 0, score: 0 }, { min: 1, score: 1 }, { min: 3, score: 3 }, { min: 5, score: 5 }],
  },
  {
    key: "overseas_companies", column: "overseas_companies", dimensionNo: 9, kind: "text",
    labelKey: "diagQOverseasCompanies",
    labelZh: "有海外分公司 / 投资公司的国家（逗号分隔）",
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 2, score: 4 }, { min: 3, score: 5 }],
  },
  // D10 投标团队与执行纪律
  {
    key: "team_discipline", column: "team_discipline", dimensionNo: 10, kind: "single",
    labelKey: "diagQTeamDiscipline",
    labelZh: "投标团队规模与留痕（投标台账 + CRM 客户跟进）？",
    options: ["无专人", "1 人且无台账", "1-2 人有投标台账", "3 人以上有投标台账且客户跟进在 CRM 留痕"],
    scoreMap: [0, 2, 4, 5],
  },
  // 意向标记：dimensionNo 0，不参与任何维度计分（spec A9）
  // V3（2026-11-23 用户拍板）：「投标意愿」题下线——提交即视为愿意，列保留 NOT NULL 并带
  // DEFAULT '是'（AI 画像契约 supplier-profile.ts 仍读该列，零契约改动），故 askInForm=false。
  {
    key: "bid_willingness", column: "bid_willingness", dimensionNo: 0, kind: "single",
    labelKey: "diagQBidWillingness",
    labelZh: "是否愿意参与联合国及政府采购投标？",
    options: ["否", "是"],
    scoreMap: [0, 0],
    askInForm: false,
  },
];

// ── V3 资质完善：目标市场码（与 supplier_certifications.scope 同码） ──

/**
 * 目标市场 = 认证字典的 `scope` 码。取字典里真实出现过的地区/国家码（`global` 除外：
 * 全球通用证书不构成「某市场准入缺口」，混进来会让每个市场都白送一条应备项）。
 */
export interface QualMarketScope {
  /** 入库值（= supplier_certifications.scope） */
  code: string;
  labelZh: string;
  labelEn: string;
  /** i18n 标签键（locales/*\/procurement.json） */
  labelKey: string;
}

export const QUAL_MARKET_SCOPES: readonly QualMarketScope[] = [
  { code: "EU", labelZh: "欧盟", labelEn: "European Union", labelKey: "diagMarketEU" },
  { code: "UK", labelZh: "英国", labelEn: "United Kingdom", labelKey: "diagMarketUK" },
  { code: "US", labelZh: "美国", labelEn: "United States", labelKey: "diagMarketUS" },
  { code: "CA", labelZh: "加拿大", labelEn: "Canada", labelKey: "diagMarketCA" },
  { code: "EAEU", labelZh: "欧亚经济联盟", labelEn: "EAEU", labelKey: "diagMarketEAEU" },
  { code: "GCC", labelZh: "海湾国家", labelEn: "GCC", labelKey: "diagMarketGCC" },
  { code: "SA", labelZh: "沙特", labelEn: "Saudi Arabia", labelKey: "diagMarketSA" },
  { code: "AU", labelZh: "澳大利亚", labelEn: "Australia", labelKey: "diagMarketAU" },
  { code: "NZ", labelZh: "新西兰", labelEn: "New Zealand", labelKey: "diagMarketNZ" },
  { code: "JP", labelZh: "日本", labelEn: "Japan", labelKey: "diagMarketJP" },
  { code: "KR", labelZh: "韩国", labelEn: "South Korea", labelKey: "diagMarketKR" },
  { code: "IN", labelZh: "印度", labelEn: "India", labelKey: "diagMarketIN" },
  { code: "BR", labelZh: "巴西", labelEn: "Brazil", labelKey: "diagMarketBR" },
  { code: "TH", labelZh: "泰国", labelEn: "Thailand", labelKey: "diagMarketTH" },
  { code: "ID", labelZh: "印度尼西亚", labelEn: "Indonesia", labelKey: "diagMarketID" },
  { code: "NG", labelZh: "尼日利亚", labelEn: "Nigeria", labelKey: "diagMarketNG" },
];

/** 目标市场码清单（入库值，校验白名单直接用这个） */
export const QUAL_MARKET_CODES: readonly string[] = QUAL_MARKET_SCOPES.map((m) => m.code);

export const QUAL_MARKET_MAP: Readonly<Record<string, QualMarketScope>> = Object.fromEntries(
  QUAL_MARKET_SCOPES.map((m) => [m.code, m]),
);

// ── V3 资质完善字段（不进 V2 十维评分、不进 AI 画像列清单） ──

/**
 * V3 只新增这一个问题（2026-11-23 用户拍板）：缺口明细在报告里呈现，不在表单展开。
 * `dimensionNo = 0`：它不改变投标能力分（V2 的 100 分口径不因诊断代次漂移，
 * 历史 V2 报告与 V3 报告的分值因此仍可比），只喂资质分级 `qual_grade`。
 */
export const DIAGNOSIS_QUAL_FIELDS: readonly DiagnosisFieldDef[] = [
  {
    key: "target_markets", column: "target_markets", dimensionNo: 0, kind: "multi",
    labelKey: "diagQTargetMarkets",
    labelZh: "计划投标的目标市场（可多选；用于比对当地准入资质缺口）",
    options: QUAL_MARKET_CODES,
    optionLabelKeys: QUAL_MARKET_SCOPES.map((m) => m.labelKey),
    required: true,
  },
  // ── V3 资格事实（决定准入判断，全部必答；报告第四章直接引用）──
  {
    key: "local_presence", column: "local_presence", dimensionNo: 0, kind: "single",
    labelKey: "diagQLocalPresence",
    labelZh: "目标市场是否已有本地实体 / 代理 / 服务点？",
    options: ["都没有", "部分市场有代理", "主要市场有代理 + 服务点", "多个市场有法人实体"],
    scoreMap: [0, 0, 0, 0],
    required: true,
  },
  {
    key: "similar_projects_band", column: "similar_projects_band", dimensionNo: 0, kind: "single",
    labelKey: "diagQSimilarProjects",
    labelZh: "近三年类似项目（可举证合同）有几份？",
    options: ["没有", "1-2 份", "3-5 份", "6 份以上"],
    scoreMap: [0, 0, 0, 0],
    required: true,
  },
  {
    key: "largest_contract_band", column: "largest_contract_band", dimensionNo: 0, kind: "single",
    labelKey: "diagQLargestContract",
    labelZh: "已履行过的最大单份合同金额？",
    options: ["50 万美元以下", "50-200 万美元", "200-1000 万美元", "1000 万美元以上"],
    scoreMap: [0, 0, 0, 0],
    required: true,
  },
  {
    key: "annual_revenue_band", column: "annual_revenue_band", dimensionNo: 0, kind: "single",
    labelKey: "diagQAnnualRevenue",
    labelZh: "上一年度营业额？",
    options: ["100 万美元以下", "100-500 万美元", "500-2000 万美元", "2000 万美元以上"],
    scoreMap: [0, 0, 0, 0],
    required: true,
  },
  {
    key: "audit_report", column: "audit_report", dimensionNo: 0, kind: "single",
    labelKey: "diagQAuditReport",
    labelZh: "审计报告与银行资信情况？",
    options: ["都没有", "仅银行资信证明", "近三年审计报告", "审计报告 + 银行资信"],
    scoreMap: [0, 0, 0, 0],
    required: true,
  },
  {
    key: "local_service_terms", column: "local_service_terms", dimensionNo: 0, kind: "single",
    labelKey: "diagQLocalServiceTerms",
    labelZh: "能否接受本地服务与质保条款（现场响应 / 质保期）？",
    options: ["不接受", "视标而定", "接受"],
    scoreMap: [0, 0, 0],
    required: true,
  },
];

/** V3：资格必答项（决定准入判断；其余能力维度均为选答） */
export const DIAGNOSIS_QUALIFICATION_REQUIRED_KEYS: readonly string[] = [
  "target_markets",
  "export_entity",
  "local_presence",
  "similar_projects_band",
  "largest_contract_band",
  "annual_revenue_band",
  "audit_report",
  "local_service_terms",
];

/** 字段是否必答：资格项恒必答；能力项默认选答（显式 required 才必答） */
export function isDiagnosisFieldRequired(field: DiagnosisFieldDef): boolean {
  if (field.kind === "single") {
    return field.dimensionNo === 0 || field.key === "export_entity" || field.required === true;
  }
  return field.required === true;
}

/** V2 + V3 全量字段（读回显、写库、校验都用这一份；顺序即写入顺序） */
export const DIAGNOSIS_ALL_FIELDS: readonly DiagnosisFieldDef[] = [
  ...DIAGNOSIS_FIELDS,
  ...DIAGNOSIS_QUAL_FIELDS,
];

/** 表单实际提问的字段：V2 里 askInForm=false 的（投标意愿）+ V3 新增 = 14 单选 + 3 多选/文本 */
export const DIAGNOSIS_FORM_FIELDS: readonly DiagnosisFieldDef[] = DIAGNOSIS_ALL_FIELDS.filter(
  (f) => f.askInForm !== false,
);

/**
 * 写库列：表单已提问的字段全写；`askInForm=false` 的列**不出现在 INSERT/UPDATE 里**，
 * 这样新行吃表上的 DEFAULT（'是'），老行的历史值也不会被提交动作覆盖。
 */
export const DIAGNOSIS_WRITABLE_FIELDS: readonly DiagnosisFieldDef[] = DIAGNOSIS_FORM_FIELDS;

export const DIAGNOSIS_FIELD_MAP: Readonly<Record<string, DiagnosisFieldDef>> = Object.fromEntries(
  DIAGNOSIS_ALL_FIELDS.map((f) => [f.key, f]),
);

/** 评分用字段（排除 dimensionNo=0 的意向标记 / 资质输入） */
export const DIAGNOSIS_SCORED_FIELDS: readonly DiagnosisFieldDef[] = DIAGNOSIS_FIELDS.filter(
  (f) => f.dimensionNo !== 0,
);

/**
 * 表单完成进度：只统计**必答题**（single）的已答数。
 * 多选/文本是选填（空数组合法、语义是"一项都拿不出"），不计入分母，
 * 否则用户会看到永远到不了 100% 的进度条。
 */
export interface DiagnosisProgress {
  answeredRequired: number;
  totalRequired: number;
  percent: number;
}

export function diagnosisProgress(answers: Record<string, string | string[]>): DiagnosisProgress {
  // V3：进度只统计必答项（资格 6 项 + 出口主体资质 + 目标市场），能力画像选答不计入分母
  const required = DIAGNOSIS_FORM_FIELDS.filter((f) => isDiagnosisFieldRequired(f));
  let answeredRequired = 0;
  for (const field of required) {
    const value = answers[field.key];
    if (Array.isArray(value) ? value.length > 0 : String(value ?? "").trim() !== "") answeredRequired += 1;
  }
  const totalRequired = required.length;
  return {
    answeredRequired,
    totalRequired,
    percent: totalRequired === 0 ? 100 : Math.round((answeredRequired / totalRequired) * 100),
  };
}

/** 最低档答案常量：D3 硬门槛判定用（spec §8.4） */
export const TENDER_EXPERIENCE_NONE = DIAGNOSIS_FIELD_MAP["tender_experience"].options![0];
/** 最低档答案常量：D1 出口主体资质硬门槛判定用（V3） */
export const EXPORT_ENTITY_NONE = DIAGNOSIS_FIELD_MAP["export_entity"].options![0];

/** 逗号/顿号/分号/空白分隔计数，与 v1 countCommaItems 同语义 */
export function countDiagnosisItems(value: string): number {
  if (!value || !value.trim()) return 0;
  return value.split(/[,，;；、\s]+/).filter((x) => x.trim().length > 0).length;
}

/** 按 bands 取分档分（bands 内 min 升序；取满足 min 的最大档） */
export function scoreByBands(bands: readonly DiagnosisBand[], count: number): number {
  const ordered = [...bands].sort((a, b) => a.min - b.min);
  let score = ordered[0]?.score ?? 0;
  for (const band of ordered) if (count >= band.min) score = band.score;
  return score;
}

/** 单字段原始分 0-5：single 查 scoreMap，multi 计入选项，text 计项 */
export function scoreDiagnosisField(field: DiagnosisFieldDef, value: string | string[]): number {
  const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
  if (empty) {
    // 空值一律落最低档：单选最低档分值、多选/文本 0 项分档
    if (field.kind === "single") return field.scoreMap![0];
    return scoreByBands(field.bands!, 0);
  }
  if (field.kind === "single") {
    const idx = field.options!.indexOf(String(value));
    if (idx < 0) throw new Error(`Diagnosis option out of range: ${field.key}=${String(value)}`);
    return field.scoreMap![idx];
  }
  if (field.kind === "multi") {
    const picked = Array.isArray(value) ? value : String(value).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const invalid = picked.filter((p) => !field.options!.includes(p));
    if (invalid.length) throw new Error(`Diagnosis option out of range: ${field.key} has ${invalid.join("/")}`);
    return scoreByBands(field.bands!, picked.length);
  }
  return scoreByBands(field.bands!, countDiagnosisItems(String(value)));
}

/**
 * 按表别名拼诊断列选择片段。列名全部来自本文件 SSOT，不接受任何外部输入。
 * 存在这里而不是各处手抄，是因为 AI 画像取数与供应商资源库候选取数**必须同口径**：
 * 两处列清单一旦漂移，候选工厂会比自家企业多（或少）几个字段，LLM 评分直接不可比。
 */
export function diagnosisColumnSelect(alias: string): string {
  return DIAGNOSIS_FIELDS.map((f) => `${alias}.${f.column}`).join(", ");
}

/** 诊断列名清单（与 DIAGNOSIS_FIELDS 同序）：供取数与完整度判定复用 */
export const DIAGNOSIS_COLUMNS: readonly string[] = DIAGNOSIS_FIELDS.map((f) => f.column);

/**
 * 结构闭合自检：钉住绝对值（权重 100、字段 22、V3 目标市场 1）+ 内部一致性，
 * 防「只做自比基线」的假门禁。由单元测试调用；生产代码不重复执行。
 */
export function assertDiagnosisDimensionsIntact(): void {
  const weightSum = DIAGNOSIS_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  if (weightSum !== 100) throw new Error(`DIAGNOSIS weight sum ${weightSum} !== 100`);
  // 22 = V2 的 19（含已下线的 bid_willingness / mandatory_docs）+ 出口主体资质 + D4 两题
  if (DIAGNOSIS_FIELDS.length !== 22) throw new Error(`DIAGNOSIS_FIELDS count ${DIAGNOSIS_FIELDS.length} !== 22`);
  if (DIAGNOSIS_QUAL_FIELDS.length !== 7) throw new Error(`DIAGNOSIS_QUAL_FIELDS count ${DIAGNOSIS_QUAL_FIELDS.length} !== 1`);
  if (DIAGNOSIS_ALL_FIELDS.length !== 29) throw new Error(`DIAGNOSIS_ALL_FIELDS count ${DIAGNOSIS_ALL_FIELDS.length} !== 23`);

  const claimed = new Set<string>();
  for (const dim of DIAGNOSIS_DIMENSIONS) {
    for (const key of dim.fields) {
      if (claimed.has(key)) throw new Error(`Field ${key} claimed by two dimensions (violates N3)`);
      claimed.add(key);
      const field = DIAGNOSIS_FIELD_MAP[key];
      if (!field) throw new Error(`Dimension ${dim.no} references unknown field ${key}`);
      if (field.dimensionNo !== dim.no) throw new Error(`Field ${key} dimensionNo ${field.dimensionNo} mismatches dim ${dim.no}`);
    }
    if (dim.no !== 1 && dim.fields.length === 0) throw new Error(`Dimension ${dim.no} has no direct field`);
  }

  for (const field of DIAGNOSIS_ALL_FIELDS) {
    if (field.kind === "single") {
      if (!field.options?.length || !field.scoreMap?.length) throw new Error(`${field.key}: single needs options + scoreMap`);
      if (field.options.length !== field.scoreMap.length) throw new Error(`${field.key}: options/scoreMap length mismatch`);
      if (field.dimensionNo !== 0 && field.scoreMap.some((s) => s < 0 || s > 5)) throw new Error(`${field.key}: score out of 0-5`);
    } else if (field.dimensionNo !== 0 && !field.bands?.length) {
      // 计分用的多选/文本必须有分档；dimensionNo=0 的输入项（如目标市场）不参与计分，无需分档
      throw new Error(`${field.key}: ${field.kind} needs bands`);
    }
    if (field.column !== field.key) throw new Error(`${field.key}: column must equal key`);
    if (field.optionLabelKeys && field.optionLabelKeys.length !== (field.options ?? []).length) {
      throw new Error(`${field.key}: optionLabelKeys must align with options`);
    }
  }

  if (DIAGNOSIS_FIELD_MAP["bid_willingness"].dimensionNo !== 0) throw new Error("bid_willingness must not be scored");
  if (claimed.has("bid_willingness")) throw new Error("bid_willingness must not belong to any dimension");

  // V3 三条口径的机器可验证部分
  if (DIAGNOSIS_FIELD_MAP["bid_willingness"].askInForm !== false) throw new Error("V3: bid_willingness must be hidden from the form");
  if (DIAGNOSIS_FORM_FIELDS.some((f) => f.key === "bid_willingness")) throw new Error("V3: form still asks bid_willingness");
  const targetMarkets = DIAGNOSIS_FIELD_MAP["target_markets"];
  if (!targetMarkets) throw new Error("V3: target_markets field is missing");
  if (targetMarkets.dimensionNo !== 0) throw new Error("V3: target_markets must not affect the V2 score");
  if (claimed.has("target_markets")) throw new Error("V3: target_markets must not belong to a dimension");
  if (targetMarkets.options?.length !== QUAL_MARKET_SCOPES.length) throw new Error("V3: target_markets options must come from QUAL_MARKET_SCOPES");
  for (const code of targetMarkets.options ?? []) {
    if (!QUAL_MARKET_CODES.includes(code)) throw new Error(`V3: unknown market code in options: ${code}`);
  }
  if (QUAL_MARKET_CODES.includes("global")) throw new Error("V3: 'global' must not be a target market (it would never produce a gap)");
  // V3-2（2026-11-23）：D4 换题后，mandatory_docs 与 bid_willingness 一样只留列不再提问
  if (DIAGNOSIS_FIELD_MAP["mandatory_docs"].askInForm !== false) throw new Error("V3: mandatory_docs must be hidden from the form");
  if (DIAGNOSIS_FORM_FIELDS.some((f) => f.key === "mandatory_docs")) throw new Error("V3: form still asks mandatory_docs");
  if (DIAGNOSIS_FIELD_MAP["export_entity"].dimensionNo !== 1) throw new Error("V3: export_entity must belong to D1");
  const d4 = DIAGNOSIS_DIMENSIONS.find((d) => d.no === 4)!;
  if (d4.fields.join(",") !== "cert_ledger,cert_delivery") throw new Error(`V3: D4 fields must be the two management questions, got ${d4.fields.join(",")}`);
  const formSingles = DIAGNOSIS_FORM_FIELDS.filter((f) => f.kind === "single").length;
  if (formSingles !== 23) throw new Error(`V3: form must ask 23 single-choice questions（资格 7 + 能力 16）, got ${formSingles}`);
}
