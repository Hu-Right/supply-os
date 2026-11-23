/**
 * 供应商诊断 V3 —— 资质分级（A/B/C）与缺口明细
 * Supplier diagnosis V3 — qualification grading (A/B/C) and gap breakdown
 *
 * @module lib/services/scoring/diagnosis-qualification
 * @description V3 只做一件事：把「目标市场」翻译成「当地准入资质应备清单」，与供应商
 *              能力档案里已持有的证书求差集，得到缺口并按个数分级。
 *
 *              为什么分级不并入 100 分：V2 的十个维度是「投标能力」，V3 的资质是「准入门槛」；
 *              两者混成一个分会导致同一家公司换个目标市场就变分，历史 V2 报告与 V3 报告
 *              也不可再比。故 `qual_grade` 单独一列，`score_total` 口径不动。
 *
 *              三条口径（2026-11-23 用户拍板）里与算法相关的部分：
 *              1. 缺口明细只进报告，不在表单里逐项问——所以输入只有目标市场，输出是明细；
 *              2. 未选目标市场 = 未分级（NULL），不臆造一个 C 级；
 *              3. 「该市场字典里没有准入证书」不算缺口（noRequirement），否则小市场天然 C 级。
 */
import {
  QUAL_MARKET_CODES,
  QUAL_MARKET_MAP,
  QUAL_MARKET_SCOPES,
} from "@/shared/constants/diagnosis-dimensions";

export type QualGrade = "A" | "B" | "C";

/** 进「应备清单」的认证性质：市场准入与产品安全。管理体系/行业/ESG 是全球通用能力，不算某市场缺口 */
export const QUAL_MARKET_REQUIRED_CATEGORIES = ["market_access", "product_safety"] as const;

/**
 * 分级门槛（唯一出处）：缺 0 项 = A（可立即入驻）；缺 1~2 项 = B（补齐这 1-2 项即可）；
 * 缺 3 项及以上 = C（需系统建设）。
 */
export const QUAL_GRADE_THRESHOLDS = { aMax: 0, bMax: 2 } as const;

export function qualGradeOfMissing(missingCount: number): QualGrade {
  if (missingCount <= QUAL_GRADE_THRESHOLDS.aMax) return "A";
  if (missingCount <= QUAL_GRADE_THRESHOLDS.bMax) return "B";
  return "C";
}

/** 认证字典的一行（只取分级需要的四列；`scope` 可能是逗号分隔的多个适用范围） */
export interface QualificationCertRef {
  code: string;
  name: string;
  category: string;
  scope: string;
  /**
   * V3：适用产品/行业桶（见 shared/constants/product-scopes）。
   * `["all"]` = 跨行业通用；空/未定义 = 字典未分类，判定时不参与比对（报告会写明）。
   */
  productScopes?: readonly string[] | null;
}

export interface QualificationGapItem {
  code: string;
  name: string;
  /** 能力档案里是否已持 */
  held: boolean;
}

export interface QualificationMarketGap {
  /** 目标市场码（= supplier_certifications.scope） */
  market: string;
  /** 该市场的应备清单（已标注持有与否） */
  required: QualificationGapItem[];
  /** 该市场缺的 code */
  missing: string[];
}

export interface QualificationBreakdown {
  /** 归一后的目标市场码（按 QUAL_MARKET_SCOPES 顺序，去重） */
  targetMarkets: string[];
  /** 逐市场明细（报告用） */
  markets: QualificationMarketGap[];
  /** 全部应备 code（跨市场去重） */
  requiredCodes: string[];
  /** 能力档案里已持的 code（归一后） */
  heldCodes: string[];
  /** 缺口 code（required - held） */
  missingCodes: string[];
  missingCount: number;
  /** 字典里没有任何准入证书的目标市场（不计缺口） */
  noRequirementMarkets: string[];
  /** 未分级原因（grade 为 null 时给出机器可读原因，便于报告解释） */
  unscoredReason: "no_target_markets" | "dict_unavailable" | null;
  /** V3：参与比对的供应商主营范围桶 */
  supplierScopes: string[];
  /** V3：是否没能从档案识别出主营范围（true 时只比对通用项） */
  scopeUnidentified: boolean;
  /** V3：同市场但因产品范围不匹配被排除的证书（报告用来解释"为什么只列这几张"） */
  skippedOutOfScopeCodes: string[];
  /** V3：同市场但字典未标注适用范围、未参与比对的证书 */
  unclassifiedCodes: string[];
  /**
   * V3-2（迁移 072）：要求条目口径的两栏结果。
   * 存在时**等级以 legal 缺口为准**，旧口径字段仅作历史与小市场回退。
   */
  requirements?: {
    legal: QualificationRequirementHit[];
    green: QualificationRequirementHit[];
    legalMissingCount: number;
  };
  /** 供应商主营范围的可读标签（报告解释裁剪口径用） */
  scopeLabels?: string[];
}

/** 要求条目的命中结果（法定 / 评分 / 自愿共用形状） */
export interface QualificationRequirementHit {
  market: string;
  kind: "legal" | "scoring" | "voluntary";
  standard: string;
  name: string;
  held: boolean;
  evidence: string;
  remediation: string;
  leadTimeDays: number | null;
  source: string;
}

export interface QualificationResult {
  /** null = 未分级（未选目标市场）。不要用 "C" 冒充「没填」 */
  grade: QualGrade | null;
  breakdown: QualificationBreakdown;
}

/** code 归一：去空白 + 大写（字典 code 与档案快照可能大小写不一致，如 ce / CE） */
export function normalizeCertCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

/** scope 可能是逗号/分号分隔的多值；`global` 不构成某市场缺口 */
export function certScopesOf(scope: string): string[] {
  return String(scope ?? "")
    .split(/[,，;；\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => Boolean(s) && s !== "GLOBAL");
}

/** 目标市场归一：只留字典里存在的码，去重并按常量顺序排列（同一批市场无论勾选顺序都产出同一份快照） */
export function normalizeTargetMarkets(raw: readonly string[] | string | undefined): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,，;；\s]+/);
  const picked = new Set(
    list.map((m) => String(m).trim().toUpperCase()).filter((m) => QUAL_MARKET_CODES.includes(m)),
  );
  return QUAL_MARKET_SCOPES.filter((m) => picked.has(m.code)).map((m) => m.code);
}

export interface EvaluateQualificationInput {
  targetMarkets: readonly string[] | string | undefined;
  /** 认证字典（调用方已过滤 is_active=1） */
  dict: readonly QualificationCertRef[];
  /** 能力档案里已持的认证 code（= enterprise_capability_items.value_json.code） */
  heldCodes: readonly string[];
  /**
   * V3：供应商主营范围桶（企业档案推导）。空数组 = 未识别，此时只比对挂 `all` 的通用项，
   * 并在明细里标 `scopeUnidentified`，报告据此说明"未识别主营范围，未做品类裁剪"。
   */
  supplierScopes?: readonly string[];
}

/** 认证是否适用于该供应商：未分类 → 不参与比对；挂 all → 通用；否则要求桶有交集 */
function matchesProductScope(
  certScopes: readonly string[] | null | undefined,
  supplierScopes: readonly string[],
): boolean {
  const list = (certScopes ?? []).map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return false;
  if (list.includes("all")) return true;
  if (supplierScopes.length === 0) return false;
  return list.some((s) => supplierScopes.includes(s));
}

/**
 * 纯函数：给定目标市场、认证字典、已持证书 → 资质分级 + 缺口明细。
 * 不查库、不看时间，报告与接口共用同一实现（可单测）。
 */
export function evaluateQualification(input: EvaluateQualificationInput): QualificationResult {
  const targetMarkets = normalizeTargetMarkets(input.targetMarkets);
  const held = new Set(input.heldCodes.map(normalizeCertCode).filter(Boolean));
  const supplierScopes = (input.supplierScopes ?? []).map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);

  const markets: QualificationMarketGap[] = [];
  const requiredSet = new Set<string>();
  const missingSet = new Set<string>();
  const skippedSet = new Set<string>();
  const unclassifiedSet = new Set<string>();
  const noRequirementMarkets: string[] = [];

  for (const market of targetMarkets) {
    const marketRows = input.dict.filter(
      (row) =>
        (QUAL_MARKET_REQUIRED_CATEGORIES as readonly string[]).includes(String(row.category ?? "").trim()) &&
        certScopesOf(row.scope).includes(market),
    );
    // V3 产品裁剪：字典没标适用范围的（未分类）不进比对；标了但与主营范围无交集的排除
    const requiredRows = marketRows.filter((row) => {
      const scopes = row.productScopes ?? [];
      if (scopes.length === 0) {
        unclassifiedSet.add(normalizeCertCode(row.code));
        return false;
      }
      if (matchesProductScope(scopes, supplierScopes)) return true;
      skippedSet.add(normalizeCertCode(row.code));
      return false;
    });

    if (requiredRows.length === 0) {
      noRequirementMarkets.push(market);
      markets.push({ market, required: [], missing: [] });
      continue;
    }

    const required: QualificationGapItem[] = requiredRows.map((row) => ({
      code: normalizeCertCode(row.code),
      name: String(row.name ?? "").trim(),
      held: held.has(normalizeCertCode(row.code)),
    }));
    const missing = required.filter((r) => !r.held).map((r) => r.code);
    missing.forEach((code) => missingSet.add(code));
    required.forEach((r) => requiredSet.add(r.code));
    markets.push({ market, required, missing });
  }

  const breakdown: QualificationBreakdown = {
    targetMarkets,
    markets,
    requiredCodes: [...requiredSet],
    heldCodes: [...held],
    missingCodes: [...missingSet],
    missingCount: missingSet.size,
    noRequirementMarkets,
    unscoredReason: targetMarkets.length === 0 ? "no_target_markets" : null,
    supplierScopes,
    scopeUnidentified: supplierScopes.length === 0,
    skippedOutOfScopeCodes: [...skippedSet],
    unclassifiedCodes: [...unclassifiedSet],
  };

  return {
    grade: targetMarkets.length === 0 ? null : qualGradeOfMissing(missingSet.size),
    breakdown,
  };
}

/** 分级中文档位文案（报告与接口共用；前端要本地化时走 i18n 键） */
export function qualGradeDescriptor(grade: QualGrade | null): {
  label: string;
  labelEn: string;
  path: string;
  pathEn: string;
} {
  if (grade === "A") {
    return {
      label: "A — 可立即入驻",
      labelEn: "A — Ready to enter",
      path: "目标市场准入资质已齐备，可直接进入投标与入驻流程",
      pathEn: "Market-access qualifications are complete; proceed to bidding and onboarding.",
    };
  }
  if (grade === "B") {
    return {
      label: "B — 补 1-2 项",
      labelEn: "B — 1-2 items to close",
      path: "补齐报告中列出的 1-2 项准入资质后即可入驻",
      pathEn: "Close the 1-2 listed market-access items, then proceed.",
    };
  }
  if (grade === "C") {
    return {
      label: "C — 需系统建设",
      labelEn: "C — Needs systematic build-out",
      path: "准入资质缺口 3 项以上，需按报告清单分阶段建设",
      pathEn: "Three or more market-access gaps; build them in phases per the report.",
    };
  }
  return {
    label: "未分级 — 未填目标市场",
    labelEn: "Not graded — no target markets",
    path: "填写目标市场后可得出资质分级",
    pathEn: "Select target markets to receive a qualification grade.",
  };
}

/** 目标市场码 → 中文名（报告用；界面走 i18n 键） */
export function marketLabelZh(code: string): string {
  return QUAL_MARKET_MAP[String(code ?? "").trim().toUpperCase()]?.labelZh ?? String(code ?? "");
}
