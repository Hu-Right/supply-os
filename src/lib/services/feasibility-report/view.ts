/**
 * 投标可行性报告 —— 视图映射
 *
 * @module lib/services/feasibility-report/view
 * @description 报告 JSON 本身已按 camelCase 契约生成；本函数是路由层唯一收口点，
 *              保证响应体的键从这里产出（API-FIELD-NAMING 红线：禁止整块透出服务对象）。
 */
import type { FeasibilityReport } from "./types";

export interface FeasibilityEnterpriseView {
  id: number;
  name: string;
}

export interface FeasibilityReportResponseView {
  report: FeasibilityReport | null;
  enterprise: FeasibilityEnterpriseView | null;
}

export interface FeasibilityReportGenerateView {
  report: FeasibilityReport;
  cached: boolean;
  enterprise: FeasibilityEnterpriseView;
}

/** 报告视图（当前与领域对象同形；保留独立收口点，未来加计算字段/脱敏只改这里） */
export function feasibilityReportViewOf(report: FeasibilityReport | null): FeasibilityReport | null {
  if (!report) return null;
  return {
    meta: {
      noticePk: report.meta.noticePk,
      enterpriseId: report.meta.enterpriseId,
      promptVersion: report.meta.promptVersion,
      model: report.meta.model ?? null,
      generatedAt: report.meta.generatedAt,
      dataCompleteness: report.meta.dataCompleteness,
      review: report.meta.review,
    },
    verdict: report.verdict,
    gaps: report.gaps,
    matrix: report.matrix,
    unknowns: report.unknowns,
    deterministic: report.deterministic,
    aiAdvice: report.aiAdvice,
    disclaimer: report.disclaimer,
  };
}

export function feasibilityEnterpriseViewOf(
  enterprise: { id: number; name: string } | null,
): FeasibilityEnterpriseView | null {
  return enterprise ? { id: enterprise.id, name: enterprise.name } : null;
}
