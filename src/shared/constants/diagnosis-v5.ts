/**
 * 供应商投标能力诊断 V5 —— 统一评分体系（资质 + 能力 + 国际供应商档案就绪度）
 * Supplier Bid-Capability Diagnosis V5 — unified scoring SSOT
 *
 * @module shared/constants/diagnosis-v5
 * @description 2026-11-24 用户口径：一张 100 分表，三部分统一计分：
 *              A 资质与合规 30 + B 能力画像 50 + C 国际供应商档案就绪度 20。
 *              目标市场保留为 A1 的前置输入，证书/资质从供应商表读取，不在表单收集。
 *              红线不单独成线，只做「不合格 / 封顶 D / 封顶 C」。
 *
 *              与 legacy `diagnosis-dimensions.ts` 的关系：
 *              - legacy 文件继续服务 AI 画像列清单与历史报告，不改；
 *              - 本文件只服务新诊断表单、校验与评分，避免一次改动打断两个契约。
 */

import { QUAL_MARKET_SCOPES } from "./diagnosis-dimensions";

export type DiagnosisV5PartCode = "A" | "B" | "C";
export type DiagnosisV5FieldKind = "single" | "multi";
export type DiagnosisV5Grade = "A" | "B" | "C" | "D";

export interface DiagnosisV5PartDef {
  code: DiagnosisV5PartCode;
  name: string;
  nameEn: string;
  weight: number;
}

export interface DiagnosisV5DimensionDef {
  no: number;
  part: DiagnosisV5PartCode;
  name: string;
  nameEn: string;
  weight: number;
  /** 该维度独占的指标 key；同一 key 不得出现在两个维度 */
  indicators: readonly string[];
}

export interface DiagnosisV5FieldDef {
  key: string;
  column: string;
  part: DiagnosisV5PartCode;
  dimensionNo: number;
  kind: DiagnosisV5FieldKind;
  labelKey: string;
  labelZh: string;
  options?: readonly string[];
  /** 选项的 i18n 标签键（与 options 等长）；目标市场这类码值走这条 */
  optionLabelKeys?: readonly string[];
  /** 选项的中文展示名（与 options 等长）；目标市场统一用数据源里的 labelZh，不依赖译文 */
  optionLabels?: readonly string[];
  /** 单选：与 options 等长，0-5 */
  scoreMap?: readonly number[];
  /** 多选：与 options 等长，每项得分（通常 0/1），总分封顶 5 */
  optionPoints?: readonly number[];
  /** 指标在维度内的权重；非计分事实（target_markets / local_presence）为空 */
  weight?: number;
  source: "form" | "derived";
  /** 是否参与评分；target_markets / local_presence 为 false */
  scored: boolean;
  required?: boolean;
  /** 派生指标的数据来源说明 */
  derivedFrom?: string;
}

// ── 三部分（合计 100） ──

export const DIAGNOSIS_V5_PARTS: readonly DiagnosisV5PartDef[] = [
  { code: "A", name: "资质与合规", nameEn: "Qualification & compliance", weight: 30 },
  { code: "B", name: "能力画像", nameEn: "Capability profile", weight: 50 },
  { code: "C", name: "国际供应商档案就绪度", nameEn: "International supplier profile readiness", weight: 20 },
];

// ── 12 个维度（合计 100） ──

export const DIAGNOSIS_V5_DIMENSIONS: readonly DiagnosisV5DimensionDef[] = [
  { no: 1, part: "A", name: "市场准入资质", nameEn: "Market access qualification", weight: 12, indicators: ["cert_coverage"] },
  { no: 2, part: "A", name: "投标资格与合规治理", nameEn: "Bid eligibility & compliance governance", weight: 10, indicators: ["target_channels", "compliance_governance"] },
  { no: 3, part: "A", name: "主体与财务资格", nameEn: "Entity & financial qualification", weight: 8, indicators: ["export_entity", "finance_credit"] },
  { no: 4, part: "B", name: "技术响应与方案", nameEn: "Technical response & solution", weight: 12, indicators: ["technical_response", "technical_differentiation", "standard_adaptation"] },
  { no: 5, part: "B", name: "履约与项目管理", nameEn: "Delivery & project management", weight: 14, indicators: ["delivery_model", "project_control", "supply_assurance"] },
  { no: 6, part: "B", name: "质量、HSE 与持续改进", nameEn: "Quality, HSE & improvement", weight: 8, indicators: ["quality_system", "hse_record"] },
  { no: 7, part: "B", name: "售后与全生命周期", nameEn: "After-sales & lifecycle support", weight: 8, indicators: ["service_sla", "warranty_terms"] },
  { no: 8, part: "B", name: "商务与成本", nameEn: "Commercial & cost", weight: 8, indicators: ["cost_pricing", "trade_terms"] },
  { no: 9, part: "C", name: "企业档案完整度", nameEn: "Corporate profile completeness", weight: 6, indicators: ["basic_profile", "cert_profile"] },
  { no: 10, part: "C", name: "英文证据库", nameEn: "English evidence library", weight: 6, indicators: ["english_evidence_level", "english_meeting_capability"] },
  { no: 11, part: "C", name: "国际注册与本地化信息", nameEn: "International registration & localization", weight: 4, indicators: ["international_visibility", "localization"] },
  { no: 12, part: "C", name: "项目业绩与投标台账", nameEn: "Project track record & bid ledger", weight: 4, indicators: ["overseas_record", "record_evidence", "team_discipline"] },
];

// ── 全量字段（23 个表单字段 + 4 个派生指标 = 27；其中 25 个计分） ──

export const DIAGNOSIS_V5_FIELDS: readonly DiagnosisV5FieldDef[] = [
  // A1 前置：目标市场（不计分，决定证书比对范围）
  {
    key: "target_markets", column: "target_markets", part: "A", dimensionNo: 1, kind: "multi",
    labelKey: "diagV5TargetMarkets",
    labelZh: "计划投标的目标市场（可多选；证书按市场比对）",
    options: QUAL_MARKET_SCOPES.map((m) => m.code),
    optionLabelKeys: QUAL_MARKET_SCOPES.map((m) => m.labelKey),
    // 中文名直接取数据源 labelZh（与报告/PDF 的 marketLabelZh 同源），不依赖语言包
    optionLabels: QUAL_MARKET_SCOPES.map((m) => m.labelZh),
    source: "form", scored: false, required: true,
  },
  // A1 派生：证书覆盖率（供应商表读取）
  {
    key: "cert_coverage", column: "cert_coverage", part: "A", dimensionNo: 1, kind: "single",
    labelKey: "diagV5CertCoverage",
    labelZh: "关键准入证书覆盖率（按目标市场，自动读取供应商表）",
    weight: 1.00, source: "derived", scored: true,
    derivedFrom: "market_requirement + supplier 证书字段",
  },
  // A2 投标资格与合规治理
  {
    key: "target_channels", column: "target_channels", part: "A", dimensionNo: 2, kind: "multi",
    labelKey: "diagV5TargetChannels",
    labelZh: "已注册/可用的国际采购渠道（可多选）",
    options: ["UNGM 联合国采购门户", "SAM.gov / UEI", "世行 / 亚行 / 非行供应商库", "欧盟 TED / ESPD", "各国政府电子采购平台", "本地供应商库 / 商会目录"],
    optionPoints: [1, 1, 1, 1, 1, 1],
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "compliance_governance", column: "compliance_governance", part: "A", dimensionNo: 2, kind: "single",
    labelKey: "diagV5ComplianceGovernance",
    labelZh: "合规制度覆盖哪些内容（制裁筛查 / 反腐败 / 培训 / 尽调 / 举报）？",
    options: ["无合规制度未筛查", "仅反腐败制度", "仅制裁与出口管制筛查", "两者都有并年度培训", "两者都有 + 培训 + 第三方尽调 + 举报渠道"],
    scoreMap: [0, 1, 2, 3, 5],
    // 资格性判定项：不答就出不了「能否进投标名单」的结论
    required: true,
    weight: 0.50, source: "form", scored: true,
  },
  // A3 主体与财务资格
  {
    key: "export_entity", column: "export_entity", part: "A", dimensionNo: 3, kind: "single",
    labelKey: "diagV5ExportEntity",
    labelZh: "出口主体资质（经营权 / 海关备案 / 外汇 / 退税）？",
    options: ["都没有", "有进出口经营权", "经营权 + 海关备案", "经营权 + 海关备案 + 外汇账户", "上述齐备 + 退税", "上述齐备且实际出口过"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    required: true,
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "finance_credit", column: "finance_credit", part: "A", dimensionNo: 3, kind: "single",
    labelKey: "diagV5FinanceCredit",
    labelZh: "审计、银行授信、履约保函与汇率对冲能力？",
    options: ["无审计、无授信", "有审计报告", "审计 + 银行授信/资信", "审计 + 授信 + 可开履约保函", "上述 + 保函额度覆盖单项目 20%", "上述 + 汇率对冲/多币种融资"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  // B1 技术响应与方案
  {
    key: "technical_response", column: "technical_response", part: "B", dimensionNo: 4, kind: "single",
    labelKey: "diagV5TechnicalResponse",
    labelZh: "能否按标书逐条出技术响应表、偏离表并附证明？",
    options: ["不能逐条应答", "仅销售或技术口头应答", "有技术团队可逐条应答，但无标准模板", "有响应表模板与偏离表，可逐条附证明", "有模板库，且 3 个以上项目按此交付", "有专职投标技术岗 + 模板库 + 案例库"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.40, source: "form", scored: true,
  },
  {
    key: "technical_differentiation", column: "technical_differentiation", part: "B", dimensionNo: 4, kind: "single",
    labelKey: "diagV5TechnicalDiff",
    labelZh: "技术差异化（专利 / 专有工艺 / 同类案例 / 第三方检测）？",
    options: ["无可举证的差异化", "仅有参数优势（自述）", "有专利或专有工艺（可提供证书）", "有同类案例（合同/验收）可举证", "专利/工艺 + 第三方检测 + 案例均可举证", "上述 + 客户证明/第三方认证"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.35, source: "form", scored: true,
  },
  {
    key: "standard_adaptation", column: "standard_adaptation", part: "B", dimensionNo: 4, kind: "single",
    labelKey: "diagV5StandardAdaptation",
    labelZh: "对目标市场技术标准的适配程度？",
    options: ["不清楚目标市场标准差异", "知道有差异，但未形成清单", "做过主要标准的差异对照", "有差异清单与整改方案", "已有按当地标准交付的项目", "有本地化技术文件模板、当地认证与验收记录"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.25, source: "form", scored: true,
  },
  // B2 履约与项目管理
  {
    key: "delivery_model", column: "delivery_model", part: "B", dimensionNo: 5, kind: "single",
    labelKey: "diagV5DeliveryModel",
    labelZh: "主要交付模式与资源可控性？",
    options: ["无稳定交付资源，临时找分包", "以分包为主，关键环节不可控", "本地代理交付，关键岗位自派", "合资/联合体，责任与接口书面化", "自营团队 + 本地服务点", "自营团队 + 本地子公司 + 本地团队"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.35, source: "form", scored: true,
  },
  {
    key: "project_control", column: "project_control", part: "B", dimensionNo: 5, kind: "single",
    labelKey: "diagV5ProjectControl",
    labelZh: "项目进度 / 质量 / 风险 / 变更 / 索赔如何管控？",
    options: ["无固定流程", "项目经理个人盯，无文档", "有进度/质量/风险流程与模板", "有 PMO 或系统化管控 + 风险登记册", "上述 + 变更/索赔管理", "上述 + 国际项目复盘 + 客户满意度记录"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.35, source: "form", scored: true,
  },
  {
    key: "supply_assurance", column: "supply_assurance", part: "B", dimensionNo: 5, kind: "multi",
    labelKey: "diagV5SupplyAssurance",
    labelZh: "供应链与履约保障（可多选）",
    options: ["关键物料双源或备选供应商", "产能证明/排产计划", "可开履约保函/预付款保函", "本地仓/区域仓或备件库", "书面应急预案（延期/缺料/政治风险）", "主要物流商协议/多式联运"],
    optionPoints: [1, 1, 1, 1, 1, 1],
    weight: 0.30, source: "form", scored: true,
  },
  // B3 质量、HSE
  {
    key: "quality_system", column: "quality_system", part: "B", dimensionNo: 6, kind: "single",
    labelKey: "diagV5QualitySystem",
    labelZh: "质量管理体系、审厂与见证试验能力？",
    options: ["无质量管理体系", "有内部检验制度，未认证", "ISO 9001 已认证", "ISO 9001 + 行业体系（IATF/ASME/API/ISO 13485）", "上述 + 近 2 年客户/第三方审厂通过", "上述 + 第三方见证试验 + 检测报告"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    required: true,
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "hse_record", column: "hse_record", part: "B", dimensionNo: 6, kind: "single",
    labelKey: "diagV5HseRecord",
    labelZh: "HSE 体系与近 3 年事故记录？",
    options: ["无 HSE 制度", "有制度但无执行记录", "ISO 45001 或 ISO 14001 已认证", "双体系认证 + 近 3 年无重大事故", "上述 + 客户 HSE 审核通过", "上述 + 事故/整改记录 + 保险"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    required: true,
    weight: 0.50, source: "form", scored: true,
  },
  // B4 售后与全生命周期
  {
    key: "service_sla", column: "service_sla", part: "B", dimensionNo: 7, kind: "single",
    labelKey: "diagV5ServiceSla",
    labelZh: "售后响应、到场与备件保障？",
    options: ["无固定售后", "仅邮件/远程支持，无时限承诺", "承诺响应时限（如 48 小时）", "SLA 含响应/到场时限 + 本地工程师/服务点", "上述 + 本地备件库", "上述 + 7×24 + 违约罚则"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "warranty_terms", column: "warranty_terms", part: "B", dimensionNo: 7, kind: "single",
    labelKey: "diagV5WarrantyTerms",
    labelZh: "质保期、性能保证与本地质保执行？",
    options: ["质保 <12 个月或不愿承诺", "12 个月标准质保", "24 个月质保", "24 个月 + 延保选项 + 性能保证", "上述 + 接受质保金/履约保函", "上述 + 本地质保执行主体 + 全生命周期成本承诺"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  // B5 商务与成本
  {
    key: "cost_pricing", column: "cost_pricing", part: "B", dimensionNo: 8, kind: "single",
    labelKey: "diagV5CostPricing",
    labelZh: "报价是否覆盖汇率、物流、账期、关税/VAT、认证与本地服务？",
    options: ["凭经验估算", "有内部成本表，未含国际费用", "含汇率、物流、账期资金成本", "含关税/VAT/认证/本地服务成本", "三种 Incoterms + DDP 报价", "专职报价岗 + 复核 + 敏感性分析/多币种"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "trade_terms", column: "trade_terms", part: "B", dimensionNo: 8, kind: "multi",
    labelKey: "diagV5TradeTerms",
    labelZh: "可支持的贸易条款与结算条件（可多选）",
    options: ["可报 FOB", "可报 CIF", "可报 DDP/DAP", "可接受 30 天以上账期", "可多币种结算/汇率锁定"],
    optionPoints: [1, 1, 1, 1, 1],
    weight: 0.50, source: "form", scored: true,
  },
  // C1 企业档案完整度（派生）
  {
    key: "basic_profile", column: "basic_profile", part: "C", dimensionNo: 9, kind: "single",
    labelKey: "diagV5BasicProfile",
    labelZh: "企业基础档案完整度（自动读取）",
    weight: 0.50, source: "derived", scored: true,
    derivedFrom: "supplier.data_quality_score",
  },
  {
    key: "cert_profile", column: "cert_profile", part: "C", dimensionNo: 9, kind: "single",
    labelKey: "diagV5CertProfile",
    labelZh: "资质与能力档案完整度（自动读取）",
    weight: 0.50, source: "derived", scored: true,
    derivedFrom: "supplier 证书字段 + 能力档案",
  },
  // C2 英文证据库
  {
    key: "english_evidence_level", column: "english_evidence_level", part: "C", dimensionNo: 10, kind: "single",
    labelKey: "diagV5EnglishEvidence",
    labelZh: "可即时提供的英文投标资料程度？",
    options: ["无英文资料", "仅英文产品页与目录", "有英文检测报告或业绩证明", "上述齐全且有英文标书素材", "全套齐备且有可引用案例库"],
    scoreMap: [0, 1, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "english_meeting_capability", column: "english_meeting_capability", part: "C", dimensionNo: 10, kind: "single",
    labelKey: "diagV5EnglishMeeting",
    labelZh: "英文答疑 / 澄清会 / 谈判能力？",
    options: ["需全程翻译陪同", "仅书面往来", "可邮件与表单独立答疑", "可独立参与视频澄清会", "可独立主讲澄清会并谈判"],
    scoreMap: [0, 1, 3, 4, 5],
    weight: 0.50, source: "form", scored: true,
  },
  // C3 国际注册与本地化
  {
    key: "international_visibility", column: "international_visibility", part: "C", dimensionNo: 11, kind: "multi",
    labelKey: "diagV5InternationalVisibility",
    labelZh: "国际供应商目录可见度（可多选）",
    options: ["官网英文页", "行业协会会员", "商会/贸促会", "本地供应商目录", "第三方信用平台", "展会/客户名录"],
    optionPoints: [1, 1, 1, 1, 1, 1],
    weight: 0.50, source: "form", scored: true,
  },
  {
    key: "local_presence", column: "local_presence", part: "C", dimensionNo: 11, kind: "single",
    labelKey: "diagV5LocalPresence",
    labelZh: "目标市场本地实体 / 代理 / 服务点情况？",
    options: ["都没有", "部分市场有非独家代理", "主要市场有独家代理/服务点", "多个市场有法人实体/分公司", "法人实体 + 本地团队 + 税务/银行账户"],
    source: "form", scored: false,
  },
  {
    key: "localization", column: "localization", part: "C", dimensionNo: 11, kind: "single",
    labelKey: "diagV5Localization",
    labelZh: "本地化运营深度（由本地存在派生）",
    weight: 0.50, source: "derived", scored: true,
    derivedFrom: "local_presence",
  },
  // C4 项目业绩与投标台账
  // 2026-11-27 用户口径：**不建业绩台账、不做结构化项目表、不要求上传**。
  // 「有没有业绩」和「能不能拿出证明」拆成两问——有业绩但拿不出证明是最常见的真实状态，
  // 合成一道题会把两者压成一个档位，判断力就丢了。
  {
    key: "overseas_record", column: "overseas_record", part: "C", dimensionNo: 12, kind: "single",
    labelKey: "diagV5OverseasRecord",
    labelZh: "是否有同类项目业绩？（海外同类 / 仅国内 / 没有）",
    options: [
      "没有同类项目业绩",
      "有国内同类项目业绩，无海外项目",
      "有海外同类项目业绩",
    ],
    scoreMap: [0, 3, 5],
    weight: 0.40, source: "form", scored: true,
  },
  {
    key: "record_evidence", column: "record_evidence", part: "C", dimensionNo: 12, kind: "single",
    labelKey: "diagV5RecordEvidence",
    labelZh: "能否提供业绩证明？（合同 / 验收单 / 业主可回访）",
    options: [
      "拿不出任何证明",
      "仅能提供合同",
      "合同 + 验收单齐全",
      "合同 + 验收单 + 业主可回访",
    ],
    scoreMap: [0, 2, 4, 5],
    weight: 0.30, source: "form", scored: true,
  },
  {
    key: "team_discipline", column: "team_discipline", part: "C", dimensionNo: 12, kind: "single",
    labelKey: "diagV5TeamDiscipline",
    labelZh: "投标团队与台账 / CRM 留痕？",
    options: ["无专人", "1 人且无台账", "1-2 人有投标台账", "3 人以上有投标台账", "上述 + 投标复盘", "上述 + CRM 客户跟进 + 知识库"],
    scoreMap: [0, 1, 2, 3, 4, 5],
    // 维度 12 三指标：业绩有无 0.40 / 能否举证 0.30 / 台账纪律 0.30
    weight: 0.30, source: "form", scored: true,
  },
];

export const DIAGNOSIS_V5_FIELD_MAP: Readonly<Record<string, DiagnosisV5FieldDef>> = Object.fromEntries(
  DIAGNOSIS_V5_FIELDS.map((f) => [f.key, f]),
);

export const DIAGNOSIS_V5_INDICATORS: readonly DiagnosisV5FieldDef[] = DIAGNOSIS_V5_FIELDS.filter((f) => f.scored);

export const DIAGNOSIS_V5_FORM_FIELDS: readonly DiagnosisV5FieldDef[] = DIAGNOSIS_V5_FIELDS.filter(
  (f) => f.source === "form",
);

export const DIAGNOSIS_V5_WRITABLE_FIELDS: readonly DiagnosisV5FieldDef[] = DIAGNOSIS_V5_FORM_FIELDS;

export const DIAGNOSIS_V5_DERIVED_FIELDS: readonly DiagnosisV5FieldDef[] = DIAGNOSIS_V5_FIELDS.filter(
  (f) => f.source === "derived",
);

export const DIAGNOSIS_V5_COLUMNS: readonly string[] = DIAGNOSIS_V5_WRITABLE_FIELDS.map((f) => f.column);

/** 目标市场码（沿用 legacy 的 16 个 scope 码，不新增市场） */
export const DIAGNOSIS_V5_MARKET_CODES: readonly string[] = QUAL_MARKET_SCOPES.map((m) => m.code);

/** 表单必答：目标市场 + 三部分里显式 required 的字段；能力题默认选答 */
export function isDiagnosisV5Required(field: DiagnosisV5FieldDef): boolean {
  if (field.key === "target_markets") return true;
  return field.required === true;
}

/** 表单完成进度：只统计必答项 */
export function diagnosisV5Progress(answers: Record<string, string | string[]>): {
  answeredRequired: number;
  totalRequired: number;
  percent: number;
} {
  const required = DIAGNOSIS_V5_FORM_FIELDS.filter(isDiagnosisV5Required);
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

/** 单选 0-5；多选按项累加、封顶 5；空值 0 */
export function scoreDiagnosisV5Field(field: DiagnosisV5FieldDef, value: string | string[] | undefined): number {
  if (field.source === "derived" || !field.scored) return 0;
  if (field.kind === "single") {
    if (!field.options || !field.scoreMap) return 0;
    const v = String(value ?? "").trim();
    if (!v) return 0;
    const idx = field.options.indexOf(v);
    if (idx < 0) throw new Error(`Diagnosis V5 option out of range: ${field.key}=${v}`);
    return field.scoreMap[idx] ?? 0;
  }
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (!field.options || !field.optionPoints) return 0;
  let sum = 0;
  for (const item of list) {
    const idx = field.options.indexOf(item);
    if (idx < 0) throw new Error(`Diagnosis V5 option out of range: ${field.key}=${item}`);
    sum += field.optionPoints[idx] ?? 0;
  }
  return Math.min(5, sum);
}

/** 25 个指标里的派生指标由调用方注入 0-5 分 */
export function derivedScoreOf(key: string, derived: Record<string, number>): number {
  const n = Number(derived[key] ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
}

export const DIAGNOSIS_V5_GRADE_BANDS = { a: 85, b: 70, c: 55 } as const;

export function gradeOfDiagnosisV5(totalScore: number): DiagnosisV5Grade {
  if (totalScore >= DIAGNOSIS_V5_GRADE_BANDS.a) return "A";
  if (totalScore >= DIAGNOSIS_V5_GRADE_BANDS.b) return "B";
  if (totalScore >= DIAGNOSIS_V5_GRADE_BANDS.c) return "C";
  return "D";
}

const GRADE_ORDER: Record<DiagnosisV5Grade, number> = { A: 0, B: 1, C: 2, D: 3 };

/** 红线封顶：cap 只降不升（A 好于 B 好于 C 好于 D） */
export function capDiagnosisV5Grade(grade: DiagnosisV5Grade, cap: DiagnosisV5Grade): DiagnosisV5Grade {
  return GRADE_ORDER[grade] <= GRADE_ORDER[cap] ? cap : grade;
}

/**
 * 结构自检：权重、指标数、维度引用、选项映射。
 * 由单元测试调用；生产代码不重复执行。
 */
export function assertDiagnosisV5Intact(): void {
  const partSum = DIAGNOSIS_V5_PARTS.reduce((s, p) => s + p.weight, 0);
  if (partSum !== 100) throw new Error(`V5 part weight sum ${partSum} !== 100`);
  const dimSum = DIAGNOSIS_V5_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  if (dimSum !== 100) throw new Error(`V5 dimension weight sum ${dimSum} !== 100`);

  const indicatorKeys = new Set<string>();
  for (const dim of DIAGNOSIS_V5_DIMENSIONS) {
    const part = DIAGNOSIS_V5_PARTS.find((p) => p.code === dim.part);
    if (!part) throw new Error(`V5 dimension ${dim.no} has unknown part ${dim.part}`);
    let w = 0;
    for (const key of dim.indicators) {
      if (indicatorKeys.has(key)) throw new Error(`V5 indicator ${key} claimed by two dimensions`);
      indicatorKeys.add(key);
      const field = DIAGNOSIS_V5_FIELD_MAP[key];
      if (!field) throw new Error(`V5 dimension ${dim.no} references unknown indicator ${key}`);
      if (field.dimensionNo !== dim.no) throw new Error(`V5 indicator ${key} dimensionNo ${field.dimensionNo} !== ${dim.no}`);
      if (field.part !== dim.part) throw new Error(`V5 indicator ${key} part ${field.part} !== ${dim.part}`);
      if (!field.scored) throw new Error(`V5 dimension ${dim.no} uses non-scored field ${key}`);
      w += field.weight ?? 0;
    }
    if (Math.abs(w - 1) > 1e-9) throw new Error(`V5 dimension ${dim.no} indicator weights ${w} !== 1`);
  }

  if (DIAGNOSIS_V5_INDICATORS.length !== 26) throw new Error(`V5 indicators ${DIAGNOSIS_V5_INDICATORS.length} !== 26`);
  if (DIAGNOSIS_V5_FORM_FIELDS.length !== 24) throw new Error(`V5 form fields ${DIAGNOSIS_V5_FORM_FIELDS.length} !== 24`);
  if (DIAGNOSIS_V5_DERIVED_FIELDS.length !== 4) throw new Error(`V5 derived fields ${DIAGNOSIS_V5_DERIVED_FIELDS.length} !== 4`);

  for (const f of DIAGNOSIS_V5_FIELDS) {
    if (f.source === "form" && f.kind === "single" && f.scored) {
      if (!f.options?.length || !f.scoreMap?.length) throw new Error(`V5 ${f.key}: single needs options + scoreMap`);
      if (f.options.length !== f.scoreMap.length) throw new Error(`V5 ${f.key}: options/scoreMap length mismatch`);
    }
    if (f.source === "form" && f.kind === "multi" && f.scored) {
      if (!f.options?.length || !f.optionPoints?.length) throw new Error(`V5 ${f.key}: multi needs options + optionPoints`);
      if (f.options.length !== f.optionPoints.length) throw new Error(`V5 ${f.key}: options/optionPoints length mismatch`);
    }
    if (f.source === "form" && !f.options?.length) throw new Error(`V5 ${f.key}: form field needs options`);
  }

  const targetMarkets = DIAGNOSIS_V5_FIELD_MAP["target_markets"];
  if (!targetMarkets?.required) throw new Error("V5 target_markets must be required");
  if (targetMarkets.scored) throw new Error("V5 target_markets must not be scored");
  if (targetMarkets.options?.length !== QUAL_MARKET_SCOPES.length) throw new Error("V5 target_markets options must come from QUAL_MARKET_SCOPES");

  // 证书不在表单收集：A1.1 必须是派生，且没有证书题
  const certCoverage = DIAGNOSIS_V5_FIELD_MAP["cert_coverage"];
  if (!certCoverage || certCoverage.source !== "derived") throw new Error("V5 cert_coverage must be derived");
  if (DIAGNOSIS_V5_FORM_FIELDS.some((f) => f.key.includes("cert") && f.key !== "cert_profile")) {
    throw new Error("V5: certificate fields must not be collected in the form");
  }
}
