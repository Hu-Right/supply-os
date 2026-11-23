/**
 * 诊断 V3 —— 资质分级取数编排
 * Diagnosis V3 — qualification evaluation orchestration
 *
 * @module lib/services/supplier-diagnosis/qualification
 * @description 把「表单给的目标市场 + 认证字典 + 企业已持证书」三块数据合起来交给纯函数
 *              `evaluateQualification`。路由只调这一层，不自己拼 SQL，也不自己判级。
 *
 *              降级口径：字典或能力档案读失败时**不让整次诊断提交失败**——
 *              投档是用户主动动作、主体与评分都还健康，因为一张字典表读不到就 500，
 *              用户会以为「提交不了」。此时 grade 落 NULL 并在明细里标 `dict_unavailable`，
 *              报告侧看到这个原因会写「资质分级暂不可用」，而不是假装 A/B/C。
 */
import type { CatalogRepo } from "@/lib/repos/catalog.repo";
import type { MarketRequirementRepo } from "@/lib/repos/market-requirement.repo";
import {
  evaluateMarketRequirements,
  gradeWithRequirements,
  mergeRequirementBreakdown,
} from "@/lib/services/scoring/diagnosis-market-requirements";
import type { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { inferProductScopes } from "@/shared/constants/product-scopes";
import type { DiagnosisAnswers } from "@/lib/services/scoring/diagnosis-v2";
import {
  evaluateQualification,
  normalizeTargetMarkets,
  type QualificationBreakdown,
  type QualificationResult,
} from "@/lib/services/scoring/diagnosis-qualification";

/** 只依赖三个方法，便于单测用假仓储（不连真库） */
export interface QualificationDeps {
  catalog: Pick<CatalogRepo, "listActiveCertificationsWithScope">;
  enterprise: Pick<EnterpriseProfileRepo, "listCertificationCodes" | "getScopeSignals">;
  /** 迁移 072：市场要求条目（法定 / 评分 / 自愿）；读失败则回退旧口径 */
  requirements?: Pick<MarketRequirementRepo, "listActive">;
}

/** 从作答里取目标市场（多选：正常是数组；容错逗号串，与仓储写库同语义） */
export function targetMarketsOf(answers: DiagnosisAnswers): string[] {
  const raw = answers.target_markets;
  if (Array.isArray(raw)) return raw;
  return String(raw ?? "").split(/[,，;；\s]+/).filter(Boolean);
}

/** 降级快照：保留用户已选市场，明确标注「字典不可用」，不产出档位 */
export function degradedQualification(targetMarkets: readonly string[]): QualificationResult {
  const markets = normalizeTargetMarkets(targetMarkets);
  const breakdown: QualificationBreakdown = {
    targetMarkets: markets,
    markets: [],
    requiredCodes: [],
    heldCodes: [],
    missingCodes: [],
    missingCount: 0,
    noRequirementMarkets: [],
    unscoredReason: "dict_unavailable",
    supplierScopes: [],
    scopeUnidentified: true,
    skippedOutOfScopeCodes: [],
    unclassifiedCodes: [],
    requirements: { legal: [], green: [], legalMissingCount: 0 },
    scopeLabels: [],
  };
  return { grade: null, breakdown };
}

export async function evaluateQualificationFor(
  supplierId: number,
  answers: DiagnosisAnswers,
  deps: QualificationDeps,
): Promise<QualificationResult> {
  const targetMarkets = targetMarketsOf(answers);
  try {
    const [dict, heldCodes, signals, requirements] = await Promise.all([
      deps.catalog.listActiveCertificationsWithScope(),
      // enterprise_id 与 supplier.id 同值（企业主体 = 已认证 supplier，见 ADR-0016）
      deps.enterprise.listCertificationCodes(supplierId),
      // 主营范围信号读失败不应拖垮整次分级：降级为「未识别」，只比对跨行业通用项
      deps.enterprise.getScopeSignals(supplierId).catch(() => null),
      // 要求条目读失败 → 回退旧口径（证书字典），医疗/建筑等仍能出分级
      deps.requirements ? deps.requirements.listActive().catch(() => []) : Promise.resolve([]),
    ]);
    const inferred = signals
      ? inferProductScopes({
          company: signals.company,
          products: signals.products,
          industryCode: signals.industryCode,
          capabilityLabels: signals.capabilityLabels,
        })
      : { scopes: [], matchedText: "" };

    const base = evaluateQualification({
      targetMarkets,
      dict,
      heldCodes,
      supplierScopes: inferred.scopes,
    });

    // V3-2：要求条目口径优先（两栏：法定门槛 + 绿色低碳/加分项）
    const reqResult = requirements.length > 0
      ? evaluateMarketRequirements({
          targetMarkets,
          requirements,
          supplierScopes: inferred.scopes,
          heldCodes,
          certDict: dict,
        })
      : null;

    return {
      grade: gradeWithRequirements(base.grade, reqResult),
      breakdown: mergeRequirementBreakdown(base.breakdown, reqResult),
    };
  } catch (err) {
    console.warn("[supplier-diagnosis] 资质分级取数失败，降级为未分级:", (err as Error).message);
    return degradedQualification(targetMarkets);
  }
}
