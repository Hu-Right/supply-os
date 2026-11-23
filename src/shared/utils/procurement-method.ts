/**
 * 采购方式推荐 — 判定引擎（F08）纯逻辑层
 * @module shared/utils/procurement-method
 *
 * @description 《全案》第 9 步定式：「规则引擎优先、AI 辅助判断、采购方确认、平台复核」，
 *              且不能只依据采购金额判断。本模块是判定树的唯一逻辑源，服务端
 *              （method_decisions 落库）与前端向导共用。
 *
 *              七维输入（设计文档 §1.3）：规格明确性 / 可标准比价 / 预算档 / 需比方案 /
 *              长期重复 / 先征集 / 强制程序。决策树按「越特殊的形态越优先」：
 *              强制程序 → LTA → EOI（不明确/先征集）→ ITB（工程正式竞争）→ RFP（比方案）→ RFQ。
 *
 *              v1 三问（objectTypes/evalMode/cycle）是七维的子集，签名保留，
 *              内部委托 v2（P0 行为经单测钉住不变）。P2 扩展点：AI 模型接入
 *              （engine_version 证据位已留）、金额阈值细档。
 */

import { PROCUREMENT_METHOD, type ProcurementMethod } from "@/shared/constants/procurement";

/** v1 Q2 评定标口径：合格最低价 / 综合评分 / 先征集意向 */
export type MethodAdvisorEvalMode = "lowest" | "scored" | "intent";

/** v1 Q3 供货周期：一次性采购 / 长期重复供货 */
export type MethodAdvisorCycle = "once" | "recurring";

/** v2 维1 规格明确性 */
export type MethodSpecClarity = "clear" | "partial" | "unclear";

/** OBJECT_TYPES 的合法值域（防未知值干扰判定；与 constants/procurement 的 OBJECT_TYPES 一致） */
const OBJECT_TYPES_VALID = new Set(["goods", "engineering", "service", "solution"]);

/** v2 七维判定输入（全部可选：缺省按最保守路径兜底 RFQ） */
export interface MethodAdvisorInput {
  /** 标的形态（需求对象多选，原样传入） */
  objectTypes?: readonly string[];
  /** 维1 规格明确性；缺省由 objectTypes 推断（goods→clear，否则 partial） */
  specClarity?: MethodSpecClarity;
  /** 维4 需比方案（v1 Q2=scored 等价 yes；intent 等价 维6=yes） */
  solutionComparison?: boolean;
  /** 维5 长期重复（v1 Q3） */
  recurring?: boolean;
  /** 维6 先征集/市场调研（v1 Q2=intent 等价 yes） */
  preSourcing?: boolean;
  /** 维3 预算金额是否已知（只影响 missingInfo，不影响方式判定） */
  budgetKnown?: boolean;
  /** 维7 强制程序指定的方式（采购方/资金方规定；命中则引擎不覆盖） */
  mandatoryRuleMethod?: string | null;
}

/** 判定输出：方式 + 命中路径 + 待补信息（全部为 i18n 键，文案在 UI 层渲染） */
export interface MethodRecommendation {
  method: ProcurementMethod;
  /** 命中路径（维度级键，如 method_reason_recurring） */
  reasonKeys: string[];
  /** 应补充的采购信息（字段级键，如 method_missing_spec） */
  missingKeys: string[];
}

/**
 * 七维判定（F08 决策树）。恒返回合法方式码；对未知输入防御。
 */
export function recommendMethodV2(input: MethodAdvisorInput = {}): MethodRecommendation {
  const types = new Set(
    (input.objectTypes ?? []).filter((t): t is string => typeof t === "string" && OBJECT_TYPES_VALID.has(t)),
  );
  const missingKeys: string[] = [];

  if (input.budgetKnown === false) missingKeys.push("method_missing_budget");
  const specClarity = input.specClarity ?? (types.has("goods") ? "clear" : types.size ? "partial" : "unclear");
  if (specClarity === "unclear") missingKeys.push("method_missing_spec");
  else if (specClarity === "partial") missingKeys.push("method_missing_spec_detail");

  // 维7 强制程序：优先执行采购方/资金方规定，平台不覆盖
  const ruled = String(input.mandatoryRuleMethod ?? "").trim().toLowerCase();
  if (ruled && Object.values(PROCUREMENT_METHOD).includes(ruled as ProcurementMethod)) {
    return { method: ruled as ProcurementMethod, reasonKeys: ["method_reason_mandatory"], missingKeys };
  }

  // 维5 长期重复 → LTA（合同模式；底层竞争方式由向导 LTA 分支再选）
  if (input.recurring) {
    return { method: PROCUREMENT_METHOD.LTA, reasonKeys: ["method_reason_recurring"], missingKeys };
  }

  // 维1 不明确 或 维6 先征集 → EOI（事前征集，产出短名单/市场调研）
  if (specClarity === "unclear" || input.preSourcing) {
    return { method: PROCUREMENT_METHOD.EOI, reasonKeys: ["method_reason_presourcing"], missingKeys };
  }

  // 工程类 → ITB（金额大、需正式竞争；先于比方案：工程+评分仍走 ITB，与 P0 单测口径一致）
  if (types.has("engineering")) {
    return { method: PROCUREMENT_METHOD.ITB, reasonKeys: ["method_reason_engineering"], missingKeys };
  }

  // 维4 需比方案（solution 任意口径，或 service+综合评分）→ RFP
  const solutionComparison = input.solutionComparison === true;
  if (types.has("solution") || (types.has("service") && solutionComparison)) {
    return { method: PROCUREMENT_METHOD.RFP, reasonKeys: ["method_reason_solution"], missingKeys };
  }

  // 兜底：标准化货物/简单服务的合格最低价 → RFQ
  return { method: PROCUREMENT_METHOD.RFQ, reasonKeys: ["method_reason_standard"], missingKeys };
}

/**
 * v1 三问 → 推荐方式（P0 向导轻量路径，签名与行为保持不变；内部委托七维判定）。
 */
export function recommendProcurementMethod(
  objectTypes: readonly string[],
  evalMode: MethodAdvisorEvalMode = "lowest",
  cycle: MethodAdvisorCycle = "once",
): ProcurementMethod {
  return recommendMethodV2({
    objectTypes,
    solutionComparison: evalMode === "scored",
    preSourcing: evalMode === "intent",
    recurring: cycle === "recurring",
  }).method;
}
