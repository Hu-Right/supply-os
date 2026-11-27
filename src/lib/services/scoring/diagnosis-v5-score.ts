/**
 * 诊断 V5 —— 评分引擎（门户执行版）
 *
 * @module lib/services/scoring/diagnosis-v5-score
 * @description 2026-11-27 口径：评分由门户执行，后台只消费快照出报告、不重算。
 *              本文件与后台 `modules/qualification/v3/scoring-v5.ts` 逐条同口径
 *              （维度聚合、派生指标分档、红线封顶、等级线），改动须两边同步。
 *              规则定义唯一来源仍是 `shared/constants/diagnosis-v5.ts`。
 */
import {
  DIAGNOSIS_V5_DIMENSIONS,
  DIAGNOSIS_V5_FIELD_MAP,
  DIAGNOSIS_V5_PARTS,
  capDiagnosisV5Grade,
  gradeOfDiagnosisV5,
  scoreDiagnosisV5Field,
  type DiagnosisV5FieldDef,
  type DiagnosisV5Grade,
} from "@/shared/constants/diagnosis-v5";

export interface DimensionScoreV5 {
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

export interface PartScoreV5 {
  code: "A" | "B" | "C";
  name: string;
  score: number;
  max: number;
}

export interface GradeCap {
  reason: string;
  cap: DiagnosisV5Grade;
}

export interface ScoringResultV5 {
  dimensions: DimensionScoreV5[];
  partScores: PartScoreV5[];
  totalScore: number;
  grade: DiagnosisV5Grade;
  gradeBeforeCaps: DiagnosisV5Grade;
  gradeLabel: string;
  gradeLabelEn: string;
  gradePath: string;
  gradePathEn: string;
  caps: GradeCap[];
  overrideGateTriggered: boolean;
  overrideGateReason: string;
  topGaps: { dimension: string; dimensionEn: string; priority: "High" | "Medium" | "Low" }[];
}

export type DiagnosisAnswersV5 = Record<string, string | string[]>;

export interface SupplierProfileBitsV5 {
  dataQualityScore: number | null;
  heldCertCount?: number;
}

export interface DiagnosisV5DerivedInput {
  /** 0-100，目标市场法定证书覆盖率 */
  certCoveragePercent: number;
  /** 目标市场法定准入缺口数（由资质分级结果注入） */
  legalMissingCount?: number;
}

export interface DiagnosisV5ScoreInput {
  answers: DiagnosisAnswersV5;
  supplier: SupplierProfileBitsV5;
  derived: DiagnosisV5DerivedInput;
}

/** 等级文案（与后台 gradeDescriptorV5 逐字一致） */
export function gradeDescriptorV5(grade: DiagnosisV5Grade): {
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
  const field = DIAGNOSIS_V5_FIELD_MAP["local_presence"];
  if (!field?.options) return 0;
  const idx = field.options.indexOf(value);
  return [0, 1, 3, 4, 5][idx] ?? 0;
}

function derivedScoreOf(field: DiagnosisV5FieldDef, input: DiagnosisV5ScoreInput): number {
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

export function scoreDiagnosisV5(input: DiagnosisV5ScoreInput): ScoringResultV5 {
  const { answers } = input;

  const dimensions: DimensionScoreV5[] = DIAGNOSIS_V5_DIMENSIONS.map((dim) => {
    let raw = 0;
    const evidence: string[] = [];
    for (const key of dim.indicators) {
      const field = DIAGNOSIS_V5_FIELD_MAP[key] as DiagnosisV5FieldDef;
      const score = field.source === "derived"
        ? derivedScoreOf(field, input)
        : scoreDiagnosisV5Field(field, answers[key]);
      raw += score * (field.weight ?? 0);
      const shown = Array.isArray(answers[key]) ? (answers[key] as string[]).join("、") : String(answers[key] ?? "").trim();
      evidence.push(`${key}=${shown || "(空)"}(${score}/5)`);
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
      evidenceSource: dim.indicators.some((key) => DIAGNOSIS_V5_FIELD_MAP[key]?.source === "derived")
        ? "表单 + 供应商表"
        : "表单",
      scoringBasis: evidence.join("；"),
      needsManualReview: rawScore === 0,
    };
  });

  const totalScore = Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0) * 10) / 10;
  const gradeBeforeCaps = gradeOfDiagnosisV5(totalScore);

  const caps: GradeCap[] = [];
  const legalMissing = Number(input.derived.legalMissingCount ?? 0);
  if (String(answers.export_entity ?? "").trim() === DIAGNOSIS_V5_FIELD_MAP["export_entity"].options![0]) {
    caps.push({ reason: "无出口主体资质（连经营权都没有）", cap: "D" });
  }
  if (String(answers.compliance_governance ?? "").trim() === DIAGNOSIS_V5_FIELD_MAP["compliance_governance"].options![0]) {
    caps.push({ reason: "合规治理缺位（无制度、未筛查）", cap: "C" });
  }
  if (legalMissing >= 3) {
    caps.push({ reason: `目标市场法定准入缺口 ${legalMissing} 项（≥3）`, cap: "D" });
  } else if (legalMissing >= 1) {
    caps.push({ reason: `目标市场法定准入缺口 ${legalMissing} 项`, cap: "C" });
  }

  let grade = gradeBeforeCaps;
  for (const c of caps) grade = capDiagnosisV5Grade(grade, c.cap);
  const descriptor = gradeDescriptorV5(grade);

  const partScores: PartScoreV5[] = DIAGNOSIS_V5_PARTS.map((p) => ({
    code: p.code,
    name: p.name,
    score: Math.round(dimensions.filter((d) => d.part === p.code).reduce((s, d) => s + d.weightedScore, 0) * 10) / 10,
    max: p.weight,
  }));

  return {
    dimensions,
    partScores,
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
  };
}
