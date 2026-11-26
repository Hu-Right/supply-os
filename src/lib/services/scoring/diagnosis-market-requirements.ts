/**
 * 市场要求判定（迁移 072 起的主口径）
 *
 * @module lib/services/scoring/diagnosis-market-requirements
 * @deprecated 2026-11-24 起市场要求判定已迁至 intelligence-daily `qualification/v3`；
 *             本文件仅保留历史回滚参考与旧单测，不得在 API 请求路径调用。
 * @description 把「目标市场 + 供应商主营范围 + 已持证书」套到 `market_requirement` 条目上，
 *              产出两栏：
 *              - **法定门槛**（kind=legal）：缺 0 项 = A，缺 1-2 项 = B，缺 3+ 项 = C；
 *              - **绿色低碳与加分项**（kind=scoring/voluntary）：不影响等级，但要逐条列出证据与整改第一步，
 *                因为招标评分与客户尽调会问。
 *
 *              与旧口径（按证书字典 `category` 过滤）的区别：要求条目自带"法定义务/评分/自愿"的
 *              法律效力、适用产品桶与法规出处，不再靠"证书性质"猜；不绑市场的要求也能挂具体市场
 *              （CBAM 就是 EU 独有、且只对钢铁铝水泥化肥氢电）。
 */
import { productScopeLabel } from "@/shared/constants/product-scopes";
import type { MarketRequirementRow } from "@/lib/repos/market-requirement.repo";
import type { QualificationBreakdown, QualGrade } from "@/lib/services/scoring/diagnosis-qualification";
import { normalizeTargetMarkets, qualGradeOfMissing } from "@/lib/services/scoring/diagnosis-qualification";
import type { QualificationCertRef } from "@/lib/services/scoring/diagnosis-qualification";

export interface RequirementHit {
  market: string;
  kind: "legal" | "scoring" | "voluntary";
  standard: string;
  name: string;
  held: boolean;
  /**
   * 三态：met=已具备 / missing=缺失（计入等级）/ unknown=待核验（无证书锚点，不计入等级）。
   * 没有 `cert_code` 的要求（CBAM 申报、EPD）无法从能力档案判定持有，标待核验而不是硬算缺失，
   * 否则所有企业都会因为"无法举证"永远卡在 B/C。
   */
  status: "met" | "missing" | "unknown";
  evidence: string;
  remediation: string;
  leadTimeDays: number | null;
  source: string;
}

export interface MarketRequirementResult {
  legal: RequirementHit[];
  green: RequirementHit[];
  legalMissingCount: number;
  grade: QualGrade | null;
}

function scopesHit(requirementScopes: readonly string[], supplierScopes: readonly string[]): boolean {
  const list = requirementScopes.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  if (list.includes("all")) return true;
  if (supplierScopes.length === 0) return list.includes("all");
  return list.some((s) => supplierScopes.includes(s));
}

export interface EvaluateMarketRequirementsInput {
  targetMarkets: readonly string[] | string | undefined;
  requirements: readonly MarketRequirementRow[];
  supplierScopes: readonly string[];
  /** 能力档案已持证书 code（大写归一后比对 certCode） */
  heldCodes: readonly string[];
  /** 旧口径的证书字典：仅用于"没有要求条目的市场"回退，避免小市场直接空表 */
  certDict?: readonly QualificationCertRef[];
}

export function evaluateMarketRequirements(input: EvaluateMarketRequirementsInput): MarketRequirementResult {
  const markets = normalizeTargetMarkets(input.targetMarkets);
  const supplierScopes = input.supplierScopes.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
  const held = new Set(input.heldCodes.map((c) => String(c ?? "").trim().toUpperCase()).filter(Boolean));

  const legal: RequirementHit[] = [];
  const green: RequirementHit[] = [];
  const seen = new Set<string>();

  for (const market of markets) {
    const rows = input.requirements.filter(
      // scope='global' 的条目对所有目标市场生效（2026-11-26 起要求条目由 150 字典派生）
      (r) => (r.market === market || r.market === "global") && scopesHit(r.productScopes, supplierScopes),
    );
    for (const r of rows) {
      const key = `${market}|${r.kind}|${r.standard}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isHeld = r.certCode ? held.has(String(r.certCode).trim().toUpperCase()) : false;
      const hit: RequirementHit = {
        market,
        kind: r.kind,
        standard: r.standard,
        name: r.name,
        held: isHeld,
        status: isHeld ? "met" : r.certCode ? "missing" : "unknown",
        evidence: r.evidence,
        remediation: r.remediation,
        leadTimeDays: r.leadTimeDays,
        source: r.source,
      };
      if (r.kind === "legal") legal.push(hit);
      else green.push(hit);
    }
  }

  // 只把「有证书锚点且未持」算作缺口；待核验项进报告但不影响等级
  const legalMissingCount = legal.filter((h) => h.status === "missing").length;
  return {
    legal,
    green,
    legalMissingCount,
    grade: markets.length === 0 ? null : qualGradeOfMissing(legalMissingCount),
  };
}

/**
 * 把要求条目结果合并进诊断快照（qual_breakdown）：
 * 保留旧口径的字段（历史兼容 + 小市场回退），新增 `requirements` 两栏与 `scopeLabels`。
 */
export function mergeRequirementBreakdown(
  base: QualificationBreakdown,
  result: MarketRequirementResult | null,
): QualificationBreakdown {
  if (!result) return base;
  const requirementMarkets = new Set([...result.legal, ...result.green].map((r) => r.market));
  const hasRequirementData = requirementMarkets.size > 0;
  return {
    ...base,
    // 有要求条目时，等级以"法定门槛缺口"为准（旧口径只作回退）
    ...(hasRequirementData
      ? {
          requirements: {
            legal: result.legal,
            green: result.green,
            legalMissingCount: result.legalMissingCount,
          },
          scopeLabels: base.supplierScopes.map((code) => productScopeLabel(code).zh),
          missingCount: result.legalMissingCount,
          missingCodes: result.legal.filter((h) => h.status === "missing").map((h) => h.standard),
          requiredCodes: result.legal.map((h) => h.standard),
        }
      : {}),
  };
}

/** 等级覆盖：有要求条目时按法定门槛算（A=0/B=1-2/C≥3） */
export function gradeWithRequirements(
  baseGrade: QualGrade | null,
  result: MarketRequirementResult | null,
): QualGrade | null {
  if (!result) return baseGrade;
  const hasRequirementData = result.legal.length + result.green.length > 0;
  return hasRequirementData ? result.grade : baseGrade;
}
