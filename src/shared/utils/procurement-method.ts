/**
 * 采购方式推荐 — 三问引导的纯逻辑层（P2 方式判定引擎的 MVP 种子）
 * @module shared/utils/procurement-method
 *
 * @description 发布向导的「方式区分」不要求采购方背术语，而是按三个维度收敛：
 *   Q1 买什么（标的形态）→ 复用需求填报的 object_types（多选，不重复问）；
 *   Q2 怎么评（评定标口径）：合格最低价 / 综合评分 / 先征集意向；
 *   Q3 什么阶段（一次性采购 / 长期重复供货）。
 *   本函数把三问答案映射为 PROCUREMENT_METHOD 取值；UI 展示推荐徽章，用户可改。
 *
 *   P2 扩展点（届时迁入服务端判定引擎）：预算金额阈值（大额不建议 RFQ）、
 *   品类敏感度、采购方主体类型等；当前签名与决策树已按可平移的纯函数设计。
 */

import { PROCUREMENT_METHOD, type ProcurementMethod } from "@/shared/constants/procurement";

/** Q2 评定标口径：合格最低价 / 综合评分 / 先征集意向 */
export type MethodAdvisorEvalMode = "lowest" | "scored" | "intent";

/** Q3 供货周期：一次性采购 / 长期重复供货 */
export type MethodAdvisorCycle = "once" | "recurring";

/** OBJECT_TYPES 的合法值域（防未知值干扰判定；与 constants/procurement 的 OBJECT_TYPES 一致） */
const OBJECT_TYPES_VALID = new Set(["goods", "engineering", "service", "solution"]);

/**
 * 三问 → 推荐采购方式。
 *
 * 决策树按「越特殊的形态越优先」排序：
 *   1. 先征集意向（事前阶段，不直接授标）        → EOI
 *   2. 长期重复供货（框架式多次交付）            → LTA
 *   3. 工程类标的（金额高、需完整投标文件包）    → ITB
 *   4. 方案型标的，或服务类按综合评分            → RFP
 *   5. 兜底：标准化货物/简单服务的合格最低价     → RFQ
 *
 * 对未知输入防御：objectTypes 忽略未知值，evalMode/cycle 取默认，恒返回合法方式码。
 */
export function recommendProcurementMethod(
  objectTypes: readonly string[],
  evalMode: MethodAdvisorEvalMode = "lowest",
  cycle: MethodAdvisorCycle = "once",
): ProcurementMethod {
  const types = new Set(
    (objectTypes ?? []).filter((t): t is string => typeof t === "string" && OBJECT_TYPES_VALID.has(t)),
  );
  if (evalMode === "intent") return PROCUREMENT_METHOD.EOI;
  if (cycle === "recurring") return PROCUREMENT_METHOD.LTA;
  if (types.has("engineering")) return PROCUREMENT_METHOD.ITB;
  if (types.has("solution") || (types.has("service") && evalMode === "scored")) {
    return PROCUREMENT_METHOD.RFP;
  }
  return PROCUREMENT_METHOD.RFQ;
}
