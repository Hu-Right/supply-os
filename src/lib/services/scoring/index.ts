/**
 * 供应商就绪度评分引擎
 * Supplier Readiness Scoring Engine
 *
 * @module lib/services/scoring
 * @description 基于 PDF「9-供应商就绪度评分表」的 10 维度加权评分体系。
 *              评分公式：加权分 = (原始评分 ÷ 5) × 权重，总分 100。
 *              本函数为纯函数，可前后端共用。
 *
 *              ARCH-P0（2026-08-31）：从 features/procurement/utils/scoringEngine
 *              迁至 lib/services/scoring，消除 lib → features 层级违反。
 *              原位置改为 re-export 保持向后兼容。
 */

// ── 输入类型（与 QualificationFormPage 的 FormState 对齐） ──

export interface QualificationScoreInput {
  company_name: string;
  company_website: string;
  founding_year: string;
  employee_count: string;
  industry: string[];
  other_industry: string;
  main_product: string;
  export_scale: string;
  certifications: string[];
  other_certifications: string;
  service_countries: string;
  overseas_companies: string;
  ungm_status: string;
  english_team: string;
  payment_terms: string;
  bid_willingness: string;
  contact_info: string;
}

// ── 输出类型 ──

export interface DimensionScore {
  /** 维度序号 1-10 */
  no: number;
  /** 维度中文名 */
  name: string;
  /** 维度英文名 */
  nameEn: string;
  /** 权重（即满分） */
  weight: number;
  /** 原始评分 0-5 */
  rawScore: number;
  /** 加权得分 */
  weightedScore: number;
  /** 证据来源说明 */
  evidenceSource: string;
  /** 评分依据描述 */
  scoringBasis: string;
  /** 是否需要人工补充评估 */
  needsManualReview: boolean;
}

export interface ScoringResult {
  dimensions: DimensionScore[];
  totalScore: number;
  grade: "A" | "B" | "C";
  gradeLabel: string;
  gradeLabelEn: string;
  gradePath: string;
  gradePathEn: string;
  overrideGateTriggered: boolean;
  overrideGateReason: string;
  topGaps: { dimension: string; dimensionEn: string; priority: "High" | "Medium" | "Low" }[];
}

// ── 辅助工具 ──

function countCommaItems(s: string): number {
  if (!s || !s.trim()) return 0;
  return s.split(/[,，;；\s]+/).filter((x) => x.trim().length > 0).length;
}

/** 国际认证关键词（用于区分"国际通用"与"国内"认证） */
const INTL_CERT_KEYWORDS = [
  "ISO", "CE", "MDR", "UKCA", "UL", "FCC", "FDA", "CPC",
  "PSE", "MIC", "KC", "SABER", "BIS", "EAC", "RCM", "ISED",
  "CSA", "INMETRO", "TISI", "SNI", "SONCAP", "G-Mark",
  "IATF", "SA8000", "HACCP", "ISO22000", "ISO13485",
];

function isIntlCert(cert: string): boolean {
  return INTL_CERT_KEYWORDS.some((kw) => cert.includes(kw));
}

// ── 10 维度评分函数 ──

function scoreVendorProfile(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const fields = [f.company_name, f.company_website, f.founding_year, f.employee_count, f.main_product];
  const filled = fields.filter((v) => v && v.trim().length > 0).length;
  // industry 是多选，额外检查
  const hasIndustry = f.industry.length > 0;
  const totalFilled = filled + (hasIndustry ? 1 : 0);
  // 最多 6 项

  if (totalFilled <= 2) {
    return { rawScore: 1, weightedScore: 0, evidenceSource: "表单", scoringBasis: "企业档案信息严重不足，仅填写少量字段", needsManualReview: false };
  }
  if (totalFilled <= 4) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `已填写 ${totalFilled}/6 项基本信息，但仍有缺失`, needsManualReview: false };
  }
  return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: "企业名称、官网、成立年份、规模、行业、主营产品等基本信息完整", needsManualReview: false };
}

function scoreEnglishEvidence(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const intlCerts = f.certifications.filter(isIntlCert).length;

  if (f.english_team === "尚不具备" && intlCerts === 0) {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "无英文团队，无国际认证", needsManualReview: false };
  }
  if (f.english_team === "具备且经验丰富" && intlCerts >= 3) {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: `英文团队经验丰富，持有 ${intlCerts} 项国际认证`, needsManualReview: false };
  }
  if (f.english_team === "具备但经验一般" || intlCerts >= 1) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `英文能力一般或国际认证有限（${intlCerts} 项）`, needsManualReview: false };
  }
  // 具备且经验丰富 but no certs
  return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: "英文团队经验丰富但国际认证较少", needsManualReview: false };
}

function scoreTenderDecoding(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  // 无直接字段，基于 english_team + bid_willingness 推断
  if (f.english_team === "尚不具备") {
    return { rawScore: 1, weightedScore: 0, evidenceSource: "推断", scoringBasis: "无英文团队，标书拆解能力存疑", needsManualReview: true };
  }
  if (f.english_team === "具备且经验丰富" && f.bid_willingness === "是") {
    return { rawScore: 4, weightedScore: 0, evidenceSource: "推断", scoringBasis: "英文团队经验丰富且有投标意愿，但未经实操验证", needsManualReview: true };
  }
  if (f.english_team === "具备但经验一般" && f.bid_willingness === "是") {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "推断", scoringBasis: "有英文基础和投标意愿，拆解能力待验证", needsManualReview: true };
  }
  return { rawScore: 2, weightedScore: 0, evidenceSource: "推断", scoringBasis: "有一定英文能力或投标意愿，但缺乏直接证据", needsManualReview: true };
}

function scoreMandatoryDocs(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const certCount = f.certifications.length;
  const hasOther = f.other_certifications && f.other_certifications.trim().length > 0;

  if (certCount === 0) {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "未持有任何列出的资质证书", needsManualReview: true };
  }
  if (certCount >= 5 && hasOther) {
    return { rawScore: 4, weightedScore: 0, evidenceSource: "表单", scoringBasis: `持有 ${certCount} 项认证且有额外资质，文件管理能力较强`, needsManualReview: true };
  }
  if (certCount >= 3) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `持有 ${certCount} 项认证，具备基本文件管理能力`, needsManualReview: true };
  }
  return { rawScore: 2, weightedScore: 0, evidenceSource: "表单", scoringBasis: `仅持有 ${certCount} 项认证，强制文件控制能力有限`, needsManualReview: true };
}

function scoreComplianceGovernance(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const intlCerts = f.certifications.filter(isIntlCert).length;
  const ungmLevel = f.ungm_status;

  if (ungmLevel === "未注册" && intlCerts === 0) {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "未注册 UNGM，无国际合规认证", needsManualReview: false };
  }
  // 修复审查 F48：原条件写作 "已注册一级(Level 2)"（一级与 Level 2 错误拼接，
  // 恒为 false），Level 1 用户永远进不了高分档；按选项实际取值修正
  if ((ungmLevel === "已注册一级(Level 1)" || ungmLevel === "已注册二级(Level 2)") && intlCerts >= 3) {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: `UNGM 高级注册 + ${intlCerts} 项国际合规认证`, needsManualReview: false };
  }
  if (ungmLevel !== "未注册" || intlCerts >= 2) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `UNGM 状态: ${ungmLevel}，国际认证 ${intlCerts} 项`, needsManualReview: false };
  }
  return { rawScore: 1, weightedScore: 0, evidenceSource: "表单", scoringBasis: "合规基础薄弱", needsManualReview: false };
}

function scoreTechnicalResponse(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const industryCount = f.industry.length;
  const hasProduct = f.main_product && f.main_product.trim().length > 0;

  if (!hasProduct && industryCount === 0) {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "未提供主营产品和行业信息", needsManualReview: false };
  }
  if (f.export_scale === "2000万美元以上" && industryCount >= 3 && hasProduct) {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: `出口规模大，跨 ${industryCount} 个行业，产品线明确`, needsManualReview: false };
  }
  if (f.export_scale === "500-2000万美元" || (industryCount >= 2 && hasProduct)) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `出口规模 ${f.export_scale}，${industryCount} 个行业`, needsManualReview: false };
  }
  if (f.export_scale === "尚未出口") {
    return { rawScore: 1, weightedScore: 0, evidenceSource: "表单", scoringBasis: "尚未开展出口业务，技术响应能力未经国际验证", needsManualReview: false };
  }
  return { rawScore: 2, weightedScore: 0, evidenceSource: "表单", scoringBasis: "有一定行业基础但出口经验有限", needsManualReview: false };
}

function scoreCostPricing(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  if (f.export_scale === "尚未出口" && f.payment_terms === "不可以") {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "无出口经验且不接受国际账期", needsManualReview: false };
  }
  if (f.export_scale === "2000万美元以上" && f.payment_terms === "可以") {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: "大规模出口且接受国际账期，报价体系成熟", needsManualReview: false };
  }
  if (f.export_scale === "500-2000万美元" && f.payment_terms === "可以") {
    return { rawScore: 4, weightedScore: 0, evidenceSource: "表单", scoringBasis: "中等出口规模且接受国际账期", needsManualReview: false };
  }
  if (f.payment_terms === "可以") {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `出口规模 ${f.export_scale}，但接受国际账期`, needsManualReview: false };
  }
  return { rawScore: 1, weightedScore: 0, evidenceSource: "表单", scoringBasis: `出口规模 ${f.export_scale}，不接受国际账期`, needsManualReview: false };
}

function scoreFinalReview(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  // 基于整体表单填写完整度推断
  const optionalFields = [
    f.founding_year, f.employee_count, f.other_industry,
    f.other_certifications, f.contact_info,
  ];
  const filledOptional = optionalFields.filter((v) => v && v.trim().length > 0).length;
  // 最多 5 项可选

  if (filledOptional === 0) {
    return { rawScore: 1, weightedScore: 0, evidenceSource: "推断", scoringBasis: "仅填写必填项，表单完整度低", needsManualReview: true };
  }
  if (filledOptional >= 4) {
    return { rawScore: 4, weightedScore: 0, evidenceSource: "推断", scoringBasis: `额外填写 ${filledOptional} 项选填信息，表单完整度高`, needsManualReview: true };
  }
  return { rawScore: 3, weightedScore: 0, evidenceSource: "推断", scoringBasis: `额外填写 ${filledOptional} 项选填信息`, needsManualReview: true };
}

function scoreDeliveryService(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  const serviceCount = countCommaItems(f.service_countries);
  const overseasCount = countCommaItems(f.overseas_companies);
  const hasOverseas = f.overseas_companies && f.overseas_companies.trim().length > 0;

  if (!hasOverseas && serviceCount === 0) {
    return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "无海外服务网络和海外机构", needsManualReview: false };
  }
  if (serviceCount >= 5 && overseasCount >= 2) {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: `${serviceCount} 个国家有服务点，${overseasCount} 个国家有海外机构`, needsManualReview: false };
  }
  if (serviceCount >= 3 || overseasCount >= 1) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: `${serviceCount} 个国家有服务点，${overseasCount} 个国家有海外机构`, needsManualReview: false };
  }
  return { rawScore: 2, weightedScore: 0, evidenceSource: "表单", scoringBasis: "海外服务覆盖有限", needsManualReview: false };
}

function scoreTeamCRM(f: QualificationScoreInput): Omit<DimensionScore, "no" | "name" | "nameEn" | "weight"> {
  let points = 0;
  if (f.english_team === "具备且经验丰富") points += 2;
  else if (f.english_team === "具备但经验一般") points += 1;

  if (f.bid_willingness === "是") points += 1;
  if (f.contact_info && f.contact_info.trim().length > 0) points += 1;

  // max points = 4
  if (points >= 4) {
    return { rawScore: 5, weightedScore: 0, evidenceSource: "表单", scoringBasis: "英文团队经验丰富，有投标意愿，已留联系方式", needsManualReview: false };
  }
  if (points >= 2) {
    return { rawScore: 3, weightedScore: 0, evidenceSource: "表单", scoringBasis: "具备一定团队基础和投标意愿", needsManualReview: false };
  }
  if (points >= 1) {
    return { rawScore: 2, weightedScore: 0, evidenceSource: "表单", scoringBasis: "团队和投标意愿有限", needsManualReview: false };
  }
  return { rawScore: 0, weightedScore: 0, evidenceSource: "表单", scoringBasis: "无英文团队、无投标意愿", needsManualReview: false };
}

// ── 维度定义 ──

interface DimensionDef {
  no: number;
  name: string;
  nameEn: string;
  weight: number;
  scorer: (f: QualificationScoreInput) => Omit<DimensionScore, "no" | "name" | "nameEn" | "weight">;
}

const DIMENSIONS: DimensionDef[] = [
  { no: 1, name: "国际供应商档案就绪度", nameEn: "International vendor profile readiness", weight: 10, scorer: scoreVendorProfile },
  { no: 2, name: "英文证据库可调用性", nameEn: "English evidence library usability", weight: 10, scorer: scoreEnglishEvidence },
  { no: 3, name: "标书拆解与投标决策能力", nameEn: "Tender decoding and bid-decision capability", weight: 10, scorer: scoreTenderDecoding },
  { no: 4, name: "强制文件控制能力", nameEn: "Mandatory-document control", weight: 10, scorer: scoreMandatoryDocs },
  { no: 5, name: "合规治理与风险升级机制", nameEn: "Compliance governance and escalation", weight: 10, scorer: scoreComplianceGovernance },
  { no: 6, name: "技术响应与方案证明能力", nameEn: "Technical response and evidence capability", weight: 15, scorer: scoreTechnicalResponse },
  { no: 7, name: "完整成本与报价决策能力", nameEn: "Full-cost pricing and bid-decision capability", weight: 15, scorer: scoreCostPricing },
  { no: 8, name: "最终审核与提交控制能力", nameEn: "Final review and submission control", weight: 10, scorer: scoreFinalReview },
  { no: 9, name: "履约组织与服务保障能力", nameEn: "Delivery organization and service assurance", weight: 5, scorer: scoreDeliveryService },
  { no: 10, name: "投标团队、语言与CRM执行纪律", nameEn: "Bid team, language and CRM execution discipline", weight: 5, scorer: scoreTeamCRM },
];

// ── 主评分函数 ──

export function scoreQualification(formData: QualificationScoreInput): ScoringResult {
  const dimensions: DimensionScore[] = DIMENSIONS.map((dim) => {
    const result = dim.scorer(formData);
    const weightedScore = Math.round((result.rawScore / 5) * dim.weight * 10) / 10;
    return {
      no: dim.no,
      name: dim.name,
      nameEn: dim.nameEn,
      weight: dim.weight,
      ...result,
      weightedScore,
    };
  });

  const totalScore = Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0) * 10) / 10;

  // 等级判定
  let grade: "A" | "B" | "C";
  let gradeLabel: string;
  let gradeLabelEn: string;
  let gradePath: string;
  let gradePathEn: string;

  if (totalScore >= 80) {
    grade = "A";
    gradeLabel = "A — 首批正式应标";
    gradeLabelEn = "A — First-batch bidding";
    gradePath = "进入10标筛选、3标深拆、1标提交的执行路径";
    gradePathEn = "Enter opportunity screening, tender deep-dive and submission track.";
  } else if (totalScore >= 60) {
    grade = "B";
    gradeLabel = "B — 补资料后应标";
    gradeLabelEn = "B — Bid after gap closure";
    gradePath = "仅关闭高优先级能力缺口后再进入正式投标";
    gradePathEn = "Close priority capability gaps before formal bidding.";
  } else {
    grade = "C";
    gradeLabel = "C — 基础辅导";
    gradeLabelEn = "C — Foundational support";
    gradePath = "先完成基础注册、证据体系、团队与流程建设";
    gradePathEn = "Build the basic profile, evidence system, team and workflow first.";
  }

  // 覆盖规则：合规维度(No.5) rawScore <= 1 或强制文件(No.4) rawScore = 0 时不得评A
  const complianceRedFlag = dimensions[4].rawScore <= 1; // No.5 合规治理
  const mandatoryDocFail = dimensions[3].rawScore === 0; // No.4 强制文件
  const overrideGateTriggered = (complianceRedFlag || mandatoryDocFail) && grade === "A";
  const overrideGateReason = overrideGateTriggered
    ? "存在未关闭的合规红线或关键强制项失败，不得评为A级"
    : "";

  // Top 5 能力缺口（按 rawScore 升序，同分按 weight 降序）
  const sorted = [...dimensions].sort((a, b) => {
    if (a.rawScore !== b.rawScore) return a.rawScore - b.rawScore;
    return b.weight - a.weight;
  });
  const topGaps = sorted.slice(0, 5).map((d) => ({
    dimension: d.name,
    dimensionEn: d.nameEn,
    priority: d.rawScore <= 1 ? "High" as const : d.rawScore <= 3 ? "Medium" as const : "Low" as const,
  }));

  return {
    dimensions,
    totalScore,
    grade,
    gradeLabel,
    gradeLabelEn,
    gradePath,
    gradePathEn,
    overrideGateTriggered,
    overrideGateReason,
    topGaps,
  };
}
