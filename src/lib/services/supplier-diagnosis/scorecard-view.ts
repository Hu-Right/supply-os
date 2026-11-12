/**
 * 供应商详情页公开成绩单视图（诊断信息的对外展示面）
 *
 * @module lib/services/supplier-diagnosis/scorecard-view
 * @description 把 supplier_diagnosis 行（一司一份的公司报告）收敛成详情页可公开的「成绩单」：
 *              总分 + 等级 + 维度得分概览 + 评估时间。**只出结论不出病灶**——
 *              维度原始分/证据来源/评分依据/短板清单（topGaps）/原始作答一律不出本视图，
 *              明细面仍走 GET /api/supplier-diagnosis/mine（仅归属人本人可见）。
 *
 *              上页资格由取数侧保证（findClaimantScorecard 只认归属人提交的报告），
 *              本视图只做形状收敛与本地化，不做资格判定。
 */
import { gradeDescriptor, type DiagnosisGrade } from "@/lib/services/scoring/diagnosis-v2";
import type { ClaimantScorecardRow } from "@/lib/repos/supplier-diagnosis.repo";

/** 单维度公开条目：名称 + 加权得分 + 该维度满分（权重）；原始分/证据/依据不外发 */
export interface ScorecardDimensionView {
  name: string;
  score: number;
  /** 该维度满分（权重），前端条宽 = score/max，展示「8/20」 */
  max: number;
}

export interface SupplierScorecardView {
  totalScore: number;
  grade: DiagnosisGrade;
  /** 已按 lang 本地化的等级文案（A/B/C → gradeDescriptor 的中/英文案） */
  gradeLabel: string;
  /** ISO 时间串，前端负责本地化格式 */
  evaluatedAt: string;
  dimensions: ScorecardDimensionView[];
}

interface BreakdownShape {
  dimensions?: Array<{ name?: unknown; nameEn?: unknown; weightedScore?: unknown; weight?: unknown }>;
}

function toGrade(total: number, persisted: string | null): DiagnosisGrade {
  if (persisted === "A" || persisted === "B" || persisted === "C") return persisted;
  return total >= 80 ? "A" : total >= 60 ? "B" : "C";
}

/**
 * 行 → 公开成绩单。breakdown 缺失/形状不合时返回 null（详情页不渲染该卡，宁缺毋假）。
 * @param lang 语言（详情路由的 ?lang）；"zh" 用中文维度名与等级文案，其余回英文
 */
export function supplierScorecardViewOf(
  row: ClaimantScorecardRow,
  lang: string,
): SupplierScorecardView | null {
  const totalScore = Number(row.score_total);
  if (row.score_total == null || !Number.isFinite(totalScore)) return null;

  let breakdown: BreakdownShape | null = null;
  if (row.score_breakdown && typeof row.score_breakdown === "object") {
    try {
      breakdown = row.score_breakdown as BreakdownShape;
    } catch {
      breakdown = null;
    }
  }
  const dims = Array.isArray(breakdown?.dimensions) ? breakdown!.dimensions : [];
  if (dims.length === 0) return null;

  const isZh = String(lang ?? "").toLowerCase().startsWith("zh");
  const grade = toGrade(totalScore, row.score_grade == null ? null : String(row.score_grade));
  const descriptor = gradeDescriptor(grade);

  const dimensions: ScorecardDimensionView[] = [];
  for (const d of dims) {
    const score = Number(d.weightedScore);
    const max = Number(d.weight);
    if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) continue;
    const name = String((isZh ? d.name : d.nameEn) ?? "").trim();
    if (!name) continue;
    dimensions.push({ name, score: Math.round(score), max: Math.round(max) });
  }
  if (dimensions.length === 0) return null;

  return {
    totalScore: Math.round(totalScore),
    grade,
    gradeLabel: isZh ? descriptor.label : descriptor.labelEn,
    evaluatedAt: new Date(row.submitted_at).toISOString(),
    dimensions,
  };
}
