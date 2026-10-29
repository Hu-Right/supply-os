/**
 * 投标可行性报告 —— 判定引擎（v0.1）
 *
 * @module lib/services/feasibility-report/engine
 * @description 要求项 × 能力项 → 报告骨架（verdict / gaps / matrix / unknowns / score）。
 *              纯函数、无 IO；LLM 抽取与建议在编排层（v0.1 先留空 aiAdvice）。
 *              决策规则见 docs/P0-投标可行性报告/02-判定规则清单.md §1.2。
 */
import { evaluateRequirement, preparationRisk } from "./rules";
import type {
  CapabilityItem,
  Decision,
  EvaluateContext,
  FeasibilityReport,
  GapItem,
  MatrixRow,
  RequirementItem,
  RequirementType,
  RuleResult,
  RuleStatus,
  UnknownItem,
} from "./types";
import { DEFAULT_SCORE_THRESHOLD, RULES_VERSION } from "./knowledge";

const DISCLAIMER = "本报告由规则引擎与 AI 辅助生成，属投标决策参考；重大投标决策请人工复核。";

/** 维度权重（v0.1 可配；见文档 §4） */
const DIMENSION_WEIGHTS = {
  qualification: 0.35,
  experience: 0.2,
  financial: 0.15,
  delivery: 0.2,
  submission: 0.1,
} as const;
type Dimension = keyof typeof DIMENSION_WEIGHTS;

function dimensionOf(type: RequirementType): Dimension {
  switch (type) {
    case "certification":
      return "qualification";
    case "experience":
      return "experience";
    case "financial":
      return "financial";
    case "technical":
    case "commercial":
    case "delivery":
    case "warranty":
      return "delivery";
    case "submission":
    case "bond":
    case "language":
    case "localization":
    case "registration":
    case "personnel":
    default:
      return "submission";
  }
}

/** 维度得分：satisfied=1 / partial=.5 / 其他=0；unknown 不计入分母 */
function dimensionScore(results: Array<{ status: RuleStatus }>): number | null {
  const counted = results.filter((r) => r.status !== "unknown" && r.status !== "not_applicable");
  if (counted.length === 0) return null;
  const points = counted.reduce((sum, r) => sum + (r.status === "satisfied" ? 1 : r.status === "partial" ? 0.5 : 0), 0);
  return points / counted.length;
}

function requirementDisplay(req: RequirementItem): string {
  const v = (req.value ?? {}) as Record<string, unknown>;
  const pick = (key: string) => (v[key] == null ? "" : String(v[key]));
  switch (req.type) {
    case "certification":
      return pick("code") || pick("name") || req.title;
    case "experience":
      return [pick("count") && `≥${pick("count")} 个`, pick("years") && `近 ${pick("years")} 年`, pick("similarScope")].filter(Boolean).join(" · ") || req.title;
    case "financial":
      return `${pick("metric") || "财务"} ${pick("operator") || ">="} ${pick("value") ?? ""}`.trim();
    case "technical":
      return `${pick("parameter")} ${pick("operator") || ">="} ${pick("value") ?? ""}${pick("unit") ? ` ${pick("unit")}` : ""}`.trim();
    case "delivery":
      return `交付期 ≤ ${pick("days") ?? ""} 天`.trim();
    case "warranty":
      return `质保 ≥ ${pick("years") ?? ""} 年`.trim();
    case "registration":
      return `平台注册：${pick("platform") || "指定平台"}`.trim();
    case "localization":
      return `本地化：${Array.isArray(v.requires) ? (v.requires as unknown[]).join(" / ") : "本地要求"}`.trim();
    case "language":
      return `投标语言：${pick("language") || "未指定"}`.trim();
    case "submission":
      return Array.isArray(v.items) && v.items.length > 0 ? `提交文件 ${v.items.length} 项` : "提交文件清单";
    case "bond":
      return pick("amount") ? `保证金 ${pick("amount")} ${pick("currency") || ""}`.trim() : "保证金要求";
    default:
      return req.title;
  }
}

function capabilityDisplay(result: RuleResult): string {
  const d = result.detail ?? {};
  const keys = ["actual", "actualCount", "actualYears", "status", "missing", "languages"];
  for (const key of keys) {
    const value = d[key];
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    if (value != null && value !== "") return String(value);
  }
  return "—";
}

function buildGap(req: RequirementItem, result: RuleResult): GapItem {
  const status = result.status as GapItem["status"];
  const suggestions: Record<GapItem["status"], string> = {
    missing: "缺失：需补充对应证据/资质后再投，或评估以联合体/分包方式补足",
    expired: "已过期：需在投标截止前完成换证/续期，并确认证书在评标有效期内",
    partial: "部分满足：需人工确认等效性或补齐剩余项",
  };
  return {
    requirementId: req.id,
    status,
    title: req.title,
    suggest: suggestions[status],
    refs: result.refs,
    ruleId: result.ruleId,
  };
}

export interface EvaluateInput {
  noticePk: number;
  enterpriseId: number;
  requirements: RequirementItem[];
  capabilities: CapabilityItem[];
  context: EvaluateContext;
}

export function evaluateFeasibilityReport(input: EvaluateInput): FeasibilityReport {
  const { requirements, capabilities, context } = input;
  const evaluated: Array<{ req: RequirementItem; result: RuleResult }> = requirements.map((req) => ({
    req,
    result: evaluateRequirement(req, capabilities, context),
  }));

  const gaps = evaluated
    .filter(({ result }) => result.status === "missing" || result.status === "expired" || result.status === "partial")
    .map(({ req, result }) => buildGap(req, result));
  const matrix: MatrixRow[] = evaluated.map(({ req, result }) => ({
    requirementId: req.id,
    title: req.title,
    requirement: requirementDisplay(req),
    capability: capabilityDisplay(result),
    status: result.status,
    refs: result.refs,
    judgedBy: "rule",
  }));
  const unknowns: UnknownItem[] = evaluated
    .filter(({ result }) => result.status === "unknown")
    .map(({ req, result }) => ({
      requirementId: req.id,
      title: req.title,
      reason: String(result.detail?.reason ?? "无法判定"),
      need: "请补充企业证据或人工确认该条款",
      ruleId: result.ruleId,
    }));

  // ── 维度得分与总分 ──
  const byDimension = new Map<Dimension, RuleResult[]>();
  for (const { req, result } of evaluated) {
    const dim = dimensionOf(req.type);
    const list = byDimension.get(dim) ?? [];
    list.push(result);
    byDimension.set(dim, list);
  }
  let weighted = 0;
  let weightSum = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS) as Array<[Dimension, number]>) {
    const score = dimensionScore(byDimension.get(dim) ?? []);
    if (score == null) continue;
    weighted += score * weight;
    weightSum += weight;
  }
  const score = weightSum > 0 ? Number((weighted / weightSum).toFixed(2)) : 0;

  // ── 结论 ──
  const mandatoryFailures = evaluated.filter(
    ({ req, result }) => req.importance === "mandatory" && (result.status === "missing" || result.status === "expired"),
  );
  const mandatoryUnknowns = evaluated.filter(
    ({ req, result }) => req.importance === "mandatory" && result.status === "unknown",
  );
  const partialOrMissing = evaluated.filter(({ result }) => result.status === "partial" || result.status === "missing");
  const threshold = context.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

  let decision: Decision;
  const reasons: FeasibilityReport["verdict"]["reasons"] = [];
  if (mandatoryFailures.length > 0) {
    decision = "no_go";
    for (const { req, result } of mandatoryFailures) {
      reasons.push({
        text: `强制项不满足：${req.title}（${result.status === "expired" ? "已过期" : "缺失"}）`,
        refs: result.refs,
        confidence: "high",
        kind: "rule",
      });
    }
  } else if (mandatoryUnknowns.length > 0) {
    decision = "conditional";
    for (const { req } of mandatoryUnknowns) {
      reasons.push({ text: `强制项无法判定：${req.title}，需补充资料/人工确认`, refs: [req.id], confidence: "medium", kind: "rule" });
    }
  } else if (partialOrMissing.length > 0 || score < threshold) {
    decision = "conditional";
    reasons.push({
      text: `存在 ${partialOrMissing.length} 项缺口或评分偏低（${score} < ${threshold}），补齐后可行性更高`,
      refs: partialOrMissing.slice(0, 5).map(({ req }) => req.id),
      confidence: "high",
      kind: "rule",
    });
  } else {
    decision = "go";
    reasons.push({ text: "强制项全部满足，未发现硬性缺口", refs: [], confidence: "high", kind: "rule" });
  }

  // 准备期风险（DEL-02，不改变结论，只提示）
  const prep = preparationRisk(context);
  if (prep.risk && prep.daysLeft != null) {
    reasons.push({
      text: `距截止仅 ${Math.max(0, Math.round(prep.daysLeft))} 天，准备期偏紧`,
      refs: [],
      confidence: "medium",
      kind: "rule",
    });
  }

  const passed = evaluated.filter(({ result }) => result.status === "satisfied").length;
  const failed = evaluated.filter(({ result }) => result.status === "missing" || result.status === "expired").length;
  const notApplicable = evaluated.filter(({ result }) => result.status === "not_applicable").length;

  return {
    meta: {
      noticePk: input.noticePk,
      enterpriseId: input.enterpriseId,
      promptVersion: context.promptVersion ?? RULES_VERSION,
      model: null,
      generatedAt: new Date().toISOString(),
      dataCompleteness: {
        requirementItems: requirements.length,
        capabilities: capabilities.length,
        unknowns: unknowns.length,
      },
      review: { status: "ai_draft", reviewedBy: null, reviewedAt: null },
    },
    verdict: { decision, score, reasons },
    gaps,
    matrix,
    unknowns,
    deterministic: {
      rulesRun: evaluated.length,
      rulesPassed: passed,
      rulesFailed: failed,
      rulesUnknown: unknowns.length,
      rulesNotApplicable: notApplicable,
    },
    aiAdvice: [],
    disclaimer: DISCLAIMER,
  };
}
