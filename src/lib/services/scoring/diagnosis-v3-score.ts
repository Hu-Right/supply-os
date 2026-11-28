/**
 * 诊断 V3 —— 评分引擎（门户执行版）
 *
 * @module lib/services/scoring/diagnosis-v3-score
 * @description 2026-11-27 口径：评分由门户执行，后台只消费快照出报告、不重算。
 *              本文件与后台 `modules/qualification/v3/scoring-v5.ts` 逐条同口径
 *              （维度聚合、派生指标分档、红线封顶、等级线），改动须两边同步。
 *              规则定义唯一来源仍是 `shared/constants/diagnosis-v3.ts`。
 */
import {
  DIAGNOSIS_V3_DIMENSIONS,
  DIAGNOSIS_V3_FIELD_MAP,
  DIAGNOSIS_V3_FORM_FIELDS,
  DIAGNOSIS_V3_PARTS,
  capDiagnosisV3Grade,
  gradeOfDiagnosisV3,
  scoreDiagnosisV3Field,
  type DiagnosisV3FieldDef,
  type DiagnosisV3Grade,
} from "@/shared/constants/diagnosis-v3";
import { evaluateBidGate, type BidGateResult } from "@/shared/constants/diagnosis-bid-gate";

export interface DimensionScoreV3 {
  no: number;
  part: "A" | "B" | "C";
  name: string;
  nameEn: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidenceSource: string;
  scoringBasis: string;
  needsManualReview: boolean;
}

export interface PartScoreV3 {
  code: "A" | "B" | "C";
  name: string;
  score: number;
  max: number;
}

export interface GradeCap {
  reason: string;
  cap: DiagnosisV3Grade;
}

/**
 * 单题得分（门户算、后台只读）。
 * 报告里的「短板题 / 全量作答」需要每道题的题目名与得分，后台不持有题字典，
 * 所以由门户在快照里带过去——这是删除后台评分引擎后必须补的一项。
 */
export interface FieldScoreV3 {
  key: string;
  dimensionNo: number;
  /** 题目中文名（后台直接用于报告，不依赖自己的字典） */
  labelZh: string;
  /** 是否计分题（派生项不参与） */
  scored: boolean;
  /** 0–5；未作答或派生项为 null */
  score: number | null;
}

export interface ScoringResultV3 {
  dimensions: DimensionScoreV3[];
  partScores: PartScoreV3[];
  /** 逐题得分（后台报告用；不放分档，只给原始 0–5） */
  fieldScores: FieldScoreV3[];
  totalScore: number;
  grade: DiagnosisV3Grade;
  gradeBeforeCaps: DiagnosisV3Grade;
  gradeLabel: string;
  gradeLabelEn: string;
  gradePath: string;
  gradePathEn: string;
  caps: GradeCap[];
  overrideGateTriggered: boolean;
  overrideGateReason: string;
  topGaps: { dimension: string; dimensionEn: string; priority: "High" | "Medium" | "Low" }[];
  /**
   * A 段合格制闸门：能不能进投标名单。
   * 与 totalScore 互不换算——出局时总分再高也不改变结论；
   * 资格具备时 B 段低于 60 也不否定资格，只标记「不建议投」。
   */
  bidGate: BidGateResult;
}

export type DiagnosisAnswersV3 = Record<string, string | string[]>;

export interface SupplierProfileBitsV3 {
  dataQualityScore: number | null;
  heldCertCount?: number;
}

export interface DiagnosisV3DerivedInput {
  /** 0-100，目标市场法定证书覆盖率 */
  certCoveragePercent: number;
  /** 目标市场法定准入缺口数（由资质分级结果注入） */
  legalMissingCount?: number;
}

export interface DiagnosisV3ScoreInput {
  answers: DiagnosisAnswersV3;
  supplier: SupplierProfileBitsV3;
  derived: DiagnosisV3DerivedInput;
}

/** 等级文案（与后台 gradeDescriptorV3 逐字一致） */
export function gradeDescriptorV3(grade: DiagnosisV3Grade): {
  label: string;
  labelEn: string;
  path: string;
  pathEn: string;
} {
  if (grade === "A") {
    return {
      label: "A — 优先应标",
      labelEn: "A — Priority bidding",
      path: "可独立投核心标段，建议进入 10 标筛选、3 标深拆、1 标提交",
      pathEn: "Bid independently on core lots; enter screening, deep-dive and submission.",
    };
  }
  if (grade === "B") {
    return {
      label: "B — 可应标",
      labelEn: "B — Bid after minor gaps",
      path: "投标前关闭 1–2 项高优先级缺口，可投中小标段",
      pathEn: "Close 1-2 priority gaps before bidding; target small and mid-size lots.",
    };
  }
  if (grade === "C") {
    return {
      label: "C — 有条件应标",
      labelEn: "C — Conditional bidding",
      path: "需联合体、分包或外部顾问；先补 3 项以上短板",
      pathEn: "Use consortium, subcontracting or advisers; close at least three gaps first.",
    };
  }
  return {
    label: "D — 暂不具备",
    labelEn: "D — Not ready",
    path: "先做基础建设（体系、证据、团队、本地资源），不建议独立应标",
    pathEn: "Build the basics first; independent bidding is not recommended.",
  };
}

/** 覆盖率 0-100 → 0-5 */
export function certCoverageScore(percent: number): number {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  if (p <= 0) return 0;
  if (p <= 25) return 1;
  if (p <= 50) return 2;
  if (p <= 75) return 3;
  if (p < 100) return 4;
  return 5;
}

/** 档案分 0-100 → 0-5 */
export function dataQualityScore(score: number | null): number {
  const q = Number(score ?? 0);
  if (q >= 85) return 5;
  if (q >= 65) return 4;
  if (q >= 45) return 3;
  if (q >= 25) return 2;
  return q > 0 ? 1 : 0;
}

/** 已持证书数量 → 证书档案完整度（近似） */
export function certProfileScore(count: number | undefined): number {
  const n = Number(count ?? 0);
  if (n <= 0) return 0;
  if (n <= 2) return 2;
  if (n <= 5) return 3;
  if (n <= 9) return 4;
  return 5;
}

/** 本地存在 5 档选项 → 0-5（非独家代理 1 / 独家或服务点 3 / 法人 4 / 法人+团队 5） */
export function localizationScore(answer: string | string[] | undefined): number {
  const value = Array.isArray(answer) ? answer[0] : String(answer ?? "");
  const field = DIAGNOSIS_V3_FIELD_MAP["local_presence"];
  if (!field?.options) return 0;
  const idx = field.options.indexOf(value);
  return [0, 1, 3, 4, 5][idx] ?? 0;
}

function derivedScoreOf(field: DiagnosisV3FieldDef, input: DiagnosisV3ScoreInput): number {
  switch (field.key) {
    case "cert_coverage":
      return certCoverageScore(input.derived.certCoveragePercent);
    case "basic_profile":
      return dataQualityScore(input.supplier.dataQualityScore);
    case "cert_profile":
      return certProfileScore(input.supplier.heldCertCount);
    case "localization":
      return localizationScore(input.answers.local_presence);
    default:
      return 0;
  }
}

function gapPriority(rawScore: number): "High" | "Medium" | "Low" {
  return rawScore <= 1 ? "High" : rawScore <= 3 ? "Medium" : "Low";
}

function rankByGap<T extends { rawScore: number; weight: number }>(dimensions: T[]): T[] {
  return [...dimensions].sort((a, b) =>
    a.rawScore !== b.rawScore ? a.rawScore - b.rawScore : b.weight - a.weight,
  );
}

export function scoreDiagnosisV3(input: DiagnosisV3ScoreInput): ScoringResultV3 {
  const { answers } = input;
  /** key → 0-5 单题分；只在维度指标里出现的题才有值（local_presence 这类前置题只用于派生） */
  const scoreByKey = new Map<string, number>();

  const dimensions: DimensionScoreV3[] = DIAGNOSIS_V3_DIMENSIONS.map((dim) => {
    let raw = 0;
    const evidence: string[] = [];
    for (const key of dim.indicators) {
      const field = DIAGNOSIS_V3_FIELD_MAP[key] as DiagnosisV3FieldDef;
      const score = field.source === "derived"
        ? derivedScoreOf(field, input)
        : scoreDiagnosisV3Field(field, answers[key]);
      raw += score * (field.weight ?? 0);
      const shown = Array.isArray(answers[key]) ? (answers[key] as string[]).join("、") : String(answers[key] ?? "").trim();
      evidence.push(`${key}=${shown || "(空)"}(${score}/5)`);
      if (field.source === "form") scoreByKey.set(key, score);
    }
    const rawScore = Math.round(raw * 10) / 10;
    return {
      no: dim.no,
      part: dim.part,
      name: dim.name,
      nameEn: dim.nameEn,
      weight: dim.weight,
      rawScore,
      weightedScore: Math.round((rawScore / 5) * dim.weight * 10) / 10,
      evidenceSource: dim.indicators.some((key) => DIAGNOSIS_V3_FIELD_MAP[key]?.source === "derived")
        ? "表单 + 供应商表"
        : "表单",
      scoringBasis: evidence.join("；"),
      needsManualReview: rawScore === 0,
    };
  });

  const totalScore = Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0) * 10) / 10;
  const gradeBeforeCaps = gradeOfDiagnosisV3(totalScore);

  const caps: GradeCap[] = [];
  const legalMissing = Number(input.derived.legalMissingCount ?? 0);
  if (String(answers.export_entity ?? "").trim() === DIAGNOSIS_V3_FIELD_MAP["export_entity"].options![0]) {
    caps.push({ reason: "无出口主体资质（连经营权都没有）", cap: "D" });
  }
  if (String(answers.compliance_governance ?? "").trim() === DIAGNOSIS_V3_FIELD_MAP["compliance_governance"].options![0]) {
    caps.push({ reason: "合规治理缺位（无制度、未筛查）", cap: "C" });
  }
  if (legalMissing >= 3) {
    caps.push({ reason: `目标市场法定准入缺口 ${legalMissing} 项（≥3）`, cap: "D" });
  } else if (legalMissing >= 1) {
    caps.push({ reason: `目标市场法定准入缺口 ${legalMissing} 项`, cap: "C" });
  }

  let grade = gradeBeforeCaps;
  for (const c of caps) grade = capDiagnosisV3Grade(grade, c.cap);
  const descriptor = gradeDescriptorV3(grade);

  const partScores: PartScoreV3[] = DIAGNOSIS_V3_PARTS.map((p) => ({
    code: p.code,
    name: p.name,
    score: Math.round(dimensions.filter((d) => d.part === p.code).reduce((s, d) => s + d.weightedScore, 0) * 10) / 10,
    max: p.weight,
  }));

  // A 段合格制：与总分平行的一条结论，不参与 totalScore，也不被 caps 影响。
  // B 段得分从 partScores 取（满分 50），换算成 100 制后再分档。
  const bidGate = evaluateBidGate(
    answers,
    partScores.find((p) => p.code === "B")?.score ?? 0,
    {
      legalMissingCount: legalMissing,
      certCoveragePercent: input.derived.certCoveragePercent,
    },
  );

  // 单题分按表单题的固定顺序输出：后台报告「全量作答」附录要逐题列，
  // 不能只列落在维度指标里的题（local_presence 这类前置题只参与派生，也要出现在附录）。
  const fieldScores: FieldScoreV3[] = DIAGNOSIS_V3_FORM_FIELDS.map((f) => ({
    key: f.key,
    dimensionNo: f.dimensionNo,
    labelZh: f.labelZh,
    scored: f.scored,
    score: f.scored ? scoreByKey.get(f.key) ?? null : null,
  }));

  return {
    dimensions,
    partScores,
    fieldScores,
    totalScore,
    grade,
    gradeBeforeCaps,
    gradeLabel: descriptor.label,
    gradeLabelEn: descriptor.labelEn,
    gradePath: descriptor.path,
    gradePathEn: descriptor.pathEn,
    caps,
    overrideGateTriggered: grade !== gradeBeforeCaps,
    overrideGateReason: caps.map((c) => c.reason).join("；"),
    topGaps: rankByGap(dimensions).slice(0, 5).map((d) => ({
      dimension: d.name,
      dimensionEn: d.nameEn,
      priority: gapPriority(d.rawScore),
    })),
    bidGate,
  };
}
