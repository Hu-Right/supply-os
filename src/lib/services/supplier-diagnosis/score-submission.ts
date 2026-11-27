/**
 * 诊断提交 —— 门户侧评分编排
 *
 * @module lib/services/supplier-diagnosis/score-submission
 * @description 2026-11-27 口径：门户负责评分，后台只消费快照出报告。
 *              本文件把「作答 + 供应商档案 + 资质分级」合成一份提交快照：
 *              1. 供应商档案片段（data_quality_score）；
 *              2. 资质分级（目标市场 vs 已持证书，含市场要求条目）；
 *              3. V5 评分（派生指标由分级结果注入：证书覆盖率、缺口数、证书数）。
 *              资质分级读不到时直接失败，不再产出「未分级」快照。
 */
import type { Pool } from "mysql2/promise";
import { CatalogRepo } from "@/lib/repos/catalog.repo";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { MarketRequirementRepo } from "@/lib/repos/market-requirement.repo";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";
import type { DiagnosisAnswers } from "@/lib/services/scoring/diagnosis-v2";
import type { QualificationBreakdown, QualGrade } from "@/lib/services/scoring/diagnosis-qualification";
import { scoreDiagnosisV5, type ScoringResultV5 } from "@/lib/services/scoring/diagnosis-v5-score";
import { evaluateQualificationFor } from "./qualification";

export interface DiagnosisScoreSnapshot {
  totalScore: number;
  grade: string;
  gradeBeforeCaps: string;
  gradeLabel: string;
  dimensions: ScoringResultV5["dimensions"];
  partScores: ScoringResultV5["partScores"];
  caps: ScoringResultV5["caps"];
  topGaps: ScoringResultV5["topGaps"];
  overrideGateTriggered: boolean;
  overrideGateReason: string;
  qualGrade: QualGrade;
  qualBreakdown: QualificationBreakdown;
}

export interface ScoredSubmission {
  companyName: string;
  score: DiagnosisScoreSnapshot;
}

/** 法定准入：证书覆盖率与缺口数（与后台 certCoverageOf 同口径） */
function certCoverageOf(breakdown: QualificationBreakdown): {
  certCoveragePercent: number;
  legalMissingCount: number;
} {
  const legal = breakdown.requirements?.legal ?? [];
  const total = legal.length;
  const held = legal.filter((r) => r.held).length;
  const legalMissingCount = breakdown.requirements?.legalMissingCount ?? breakdown.missingCount ?? 0;
  return {
    certCoveragePercent: total > 0 ? Math.round((held / total) * 1000) / 10 : 0,
    legalMissingCount,
  };
}

export async function scoreDiagnosisSubmission(
  pool: Pool,
  supplierId: number,
  answers: DiagnosisAnswers,
): Promise<ScoredSubmission> {
  const profile = await new SupplierDirectoryRepo(pool).findProfileBits(supplierId);
  if (!profile) throw new Error("DIAGNOSIS_SUPPLIER_NOT_FOUND");

  const qualification = await evaluateQualificationFor(supplierId, answers, {
    catalog: new CatalogRepo(pool),
    enterprise: new EnterpriseProfileRepo(pool),
    requirements: new MarketRequirementRepo(pool),
  });
  const qualGrade = qualification.grade;
  if (!qualGrade) {
    // 目标市场必填 + 数据可用 → 不允许「未分级」；这是数据/配置问题，明确失败而不是给假快照
    throw new Error("DIAGNOSIS_QUALIFICATION_UNAVAILABLE");
  }

  const { certCoveragePercent, legalMissingCount } = certCoverageOf(qualification.breakdown);
  const scored = scoreDiagnosisV5({
    answers,
    supplier: {
      dataQualityScore: profile.dataQualityScore,
      heldCertCount: qualification.breakdown.heldCodes.length,
    },
    derived: { certCoveragePercent, legalMissingCount },
  });

  return {
    companyName: profile.company ?? "",
    score: {
      totalScore: scored.totalScore,
      grade: scored.grade,
      gradeBeforeCaps: scored.gradeBeforeCaps,
      gradeLabel: scored.gradeLabel,
      dimensions: scored.dimensions,
      partScores: scored.partScores,
      caps: scored.caps,
      topGaps: scored.topGaps,
      overrideGateTriggered: scored.overrideGateTriggered,
      overrideGateReason: scored.overrideGateReason,
      qualGrade,
      qualBreakdown: qualification.breakdown,
    },
  };
}
