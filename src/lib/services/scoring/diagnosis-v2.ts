/**
 * 供应商投标能力诊断 v2 —— 评分引擎
 * Supplier Bid-Capability Diagnosis v2 Scoring
 *
 * @module lib/services/scoring/diagnosis-v2
 * @description 与 v1（`./index.ts`）并存，不改 v1：P1 阶段只新增，P3 退役时再替换调用方。
 *              与 v1 的三处本质差异，对应 spec §8.4 的三条止血：
 *              1. 每个维度只读自己独占的字段（规范 N3），不再出现 english_team /
 *                 certifications / export_scale 被 2-3 个维度重复计权；
 *              2. D3 / D4 / D8 全部改为直采证据，v1 里"无直接字段，基于推断"与
 *                 "数选填题填了几项"的算法彻底移除；
 *              3. D1 由 supplier 主数据派生（本表不收企业基础信息，规范 N2），
 *                 评的是档案完整度，而不是用户当场打了几行字。
 *              等级门槛、覆盖闸口语义、输出形状与 v1 保持一致，PDF 与前端可零改造消费。
 */
import {
  DIAGNOSIS_DIMENSIONS,
  DIAGNOSIS_FIELD_MAP,
  TENDER_EXPERIENCE_NONE,
  scoreDiagnosisField,
  type DiagnosisFieldDef,
} from "@/shared/constants/diagnosis-dimensions";
/**
 * 评分输出结构。原住在 v1 引擎 `scoring/index.ts`，v1 退役后收入本文件 ——
 * 报告 PDF、接口响应、快照落库均以此为准（字段含义与 v1 一致，保证下游无需改接）。
 */
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
  grade: DiagnosisGrade;
  gradeLabel: string;
  gradeLabelEn: string;
  gradePath: string;
  gradePathEn: string;
  overrideGateTriggered: boolean;
  overrideGateReason: string;
  topGaps: { dimension: string; dimensionEn: string; priority: "High" | "Medium" | "Low" }[];
}

/** 等级与区间的唯一出处：评分引擎与 PDF 报告共用，避免两处各写一套 80/60 阈值 */
export type DiagnosisGrade = "A" | "B" | "C";

export function gradeDescriptor(grade: DiagnosisGrade): {
  label: string; labelEn: string; path: string; pathEn: string;
} {
  if (grade === "A") {
    return {
      label: "A — 首批正式应标",
      labelEn: "A — First-batch bidding",
      path: "进入10标筛选、3标深拆、1标提交的执行路径",
      pathEn: "Enter opportunity screening, tender deep-dive and submission track.",
    };
  }
  if (grade === "B") {
    return {
      label: "B — 补资料后应标",
      labelEn: "B — Bid after gap closure",
      path: "仅关闭高优先级能力缺口后再进入正式投标",
      pathEn: "Close priority capability gaps before formal bidding.",
    };
  }
  return {
    label: "C — 基础辅导",
    labelEn: "C — Foundational support",
    path: "先完成基础注册、证据体系、团队与流程建设",
    pathEn: "Build the basic profile, evidence system, team and workflow first.",
  };
}

/** 缺口优先级分档：评分结果的 topGaps 与 PDF 报告共用，不在报告里再判一次 */
export function gapPriority(rawScore: number): "High" | "Medium" | "Low" {
  return rawScore <= 1 ? "High" : rawScore <= 3 ? "Medium" : "Low";
}

/** 按缺口严重度排序（rawScore 升序、同分按权重降）；返回副本，不改原数组 */
export function rankByGap<T extends { rawScore: number; weight: number }>(dimensions: T[]): T[] {
  return [...dimensions].sort((a, b) =>
    a.rawScore !== b.rawScore ? a.rawScore - b.rawScore : b.weight - a.weight,
  );
}

/**
 * D1 派生所需的 supplier 主数据片段。
 * `dataQualityScore` 是 supplier 表的 **生成列**（20 个关键字段非空各计 5 分，与后台同口径），
 * 本引擎不另发明一套“档案完整度”算法，直接沿用该权威值；`infoChecked` 是人工核对标记。
 */
export interface SupplierProfileBits {
  /** supplier.data_quality_score，0-100；NULL 视为未建档 */
  dataQualityScore: number | null;
  infoChecked: boolean;
}

/** key = DIAGNOSIS_FIELDS[*].key；单选为 string，多选为 string[]，文本为 string */
export type DiagnosisAnswers = Record<string, string | string[]>;

export interface DiagnosisScoreInput {
  answers: DiagnosisAnswers;
  supplier: SupplierProfileBits;
}

/**
 * D1：直接用 supplier 生成列 data_quality_score（0-100）分档，与后台同源可辩护：
 * 0→0 / 1-24→1 / 25-44→2 / 45-64→3 / 65-84→4 / 85-100→5。
 * 未经人工核对（infoChecked=false）不得得满分，封顶 4——档案字段的“多”不等于“真”。
 */
function scoreProfileDimension(supplier: SupplierProfileBits): { rawScore: number; scoringBasis: string } {
  const q = Number(supplier.dataQualityScore ?? 0);
  let rawScore =
    q >= 85 ? 5 : q >= 65 ? 4 : q >= 45 ? 3 : q >= 25 ? 2 : q > 0 ? 1 : 0;
  let basis = `企业档案资料完整度 ${q}/100（supplier 生成列，与后台同口径）`;
  if (!supplier.infoChecked && rawScore === 5) {
    rawScore = 4;
    basis += "，资料尚未经人工核对，封顶 4/5";
  } else if (!supplier.infoChecked) {
    basis += "，资料尚未经人工核对";
  }
  return { rawScore, scoringBasis: basis };
}

/** 维度内多字段：各字段 0-5 原始分取算术平均后四舍五入到整数档（spec §8.4） */
function aggregateDimension(fields: readonly string[], answers: DiagnosisAnswers) {
  let sum = 0;
  const evidence: string[] = [];
  for (const key of fields) {
    const field = DIAGNOSIS_FIELD_MAP[key] as DiagnosisFieldDef;
    const score = scoreDiagnosisField(field, answers[key] ?? (field.kind === "multi" ? [] : ""));
    sum += score;
    const raw = answers[key];
    const shown = Array.isArray(raw) ? raw.filter(Boolean).join("、") : String(raw ?? "").trim();
    evidence.push(`${field.labelKey}=${shown || "(空)"}(${score}/5)`);
  }
  const rawScore = Math.round(sum / fields.length);
  return { rawScore: Math.max(0, Math.min(5, rawScore)), scoringBasis: evidence.join("；") };
}

export function scoreDiagnosis(input: DiagnosisScoreInput): ScoringResult {
  const { answers, supplier } = input;

  const dimensions: DimensionScore[] = DIAGNOSIS_DIMENSIONS.map((dim) => {
    const base =
      dim.no === 1
        ? scoreProfileDimension(supplier)
        : aggregateDimension(dim.fields, answers);

    // D3 硬门槛：从未参与国际公采投标 → 整维压到 ≤1，防止靠"熟悉文件体系"刷分
    let rawScore = base.rawScore;
    let scoringBasis = base.scoringBasis;
    if (dim.no === 3 && answers.tender_experience === TENDER_EXPERIENCE_NONE && rawScore > 1) {
      rawScore = 1;
      scoringBasis = `${scoringBasis}；从未参与国际公采投标，整维封顶 1/5`;
    }

    return {
      no: dim.no,
      name: dim.name,
      nameEn: dim.nameEn,
      weight: dim.weight,
      rawScore,
      weightedScore: Math.round((rawScore / 5) * dim.weight * 10) / 10,
      evidenceSource: dim.no === 1 ? "主数据派生" : "表单",
      scoringBasis,
      needsManualReview: rawScore === 0,
    };
  });

  const totalScore = Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0) * 10) / 10;

  const grade: DiagnosisGrade = totalScore >= 80 ? "A" : totalScore >= 60 ? "B" : "C";
  const {
    label: gradeLabel, labelEn: gradeLabelEn, path: gradePath, pathEn: gradePathEn,
  } = gradeDescriptor(grade);

  // 覆盖闸口（沿用 v1 语义 + 新增投标履历红线）：命中红线不得评 A
  const complianceRedFlag = dimensions[4].rawScore <= 1; // No.5 合规治理
  const mandatoryDocFail = dimensions[3].rawScore === 0; // No.4 强制文件
  const noTenderRecord = answers.tender_experience === TENDER_EXPERIENCE_NONE; // No.3 从未投标
  const overrideGateTriggered = (complianceRedFlag || mandatoryDocFail || noTenderRecord) && grade === "A";
  const overrideGateReason = overrideGateTriggered
    ? "存在未关闭的合规红线、关键强制项缺失或无国际投标履历，不得评为A级"
    : "";

  // Top 5 能力缺口（排序与分档规则见 rankByGap / gapPriority）
  const topGaps = rankByGap(dimensions).slice(0, 5).map((d) => ({
    dimension: d.name,
    dimensionEn: d.nameEn,
    priority: gapPriority(d.rawScore),
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
