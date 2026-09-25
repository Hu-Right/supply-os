/**
 * 采购摘要 · 免费档脱敏工具（跨路由复用的纯函数与权益码常量）
 *
 * @module lib/services/benefit-matrix
 * @description 权益门控的单一事实源已收口到 src/lib/repos/benefit-system.repo.ts
 *              （按 crm_plan_benefits 矩阵逐格判定，未订阅一律读 free 列基线）。
 *              本模块只保留两件事，且不再携带任何"档位数字（benefit_rank）"概念：
 *              1. ai_summary 权益码与"完整"层级常量——层级含义的权威定义在库内
 *                 crm_benefit_catalog.level_dict（1=部分脱敏 / 2=完整），此处只引用数字；
 *              2. 免费档摘要脱敏纯函数 maskSummaryForFree（ai-summary 非流式与流式路由共用）。
 *              摘要/评分生成走用户 BYOK 大模型凭证（resolveLlmCredentials），平台无边际成本。
 */

/** 摘要六维度 key（与 AiSummaryResult / ai-summary 路由负载一致） */
export const SUMMARY_DIMENSIONS = [
  "coreDeliverables",
  "keyQualifications",
  "paymentCycle",
  "competitiveLandscape",
  "bidStrategy",
  "riskAlerts",
] as const;

export type SummaryDimension = (typeof SUMMARY_DIMENSIONS)[number];

/** 免费档可完整查看的维度 */
const FREE_SUMMARY_DIMENSIONS: readonly SummaryDimension[] = ["coreDeliverables"];
/** 免费档可试读（截断）的维度 → 保留字符数 */
const FREE_SUMMARY_PREVIEW: Partial<Record<SummaryDimension, number>> = {
  keyQualifications: 200,
};

/**
 * 采购摘要的权益码与"完整"层级。
 * 层级含义的权威定义在库内 crm_benefit_catalog.level_dict
 * （1=部分脱敏 / 2=完整），此处只引用数字不重复写文字，避免文案两处存放。
 * 免费档取 L1：服务端脱敏（高价值维度整段置空），与 xlsx 逐字一致。
 */
export const AI_SUMMARY_BENEFIT = "ai_summary";
export const AI_SUMMARY_FULL_LEVEL = 2;
/** 低于此层级（=0，如 starter/pro）完全不展示摘要（只看原文）；=1 脱敏试读（free）；>=2 完整。 */
export const AI_SUMMARY_MIN_VIEW_LEVEL = 1;

/**
 * 公告译文权益码（bool）：/translation、/content 的 description_cn、前端「查看译文」切换的档位门控来源。
 * 矩阵取值：free/starter/pro=0（只看原文，无译文），unlimited 及以上=1（含中文报告）。
 * 与 ai_summary / ai_match 同属「中文/AI 加工能力」，1299+ 才解锁。
 */
export const NOTICE_TRANSLATION_BENEFIT = "notice_translation";

export interface MaskableSummary {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  competitiveLandscape: string;
  bidStrategy: string;
  riskAlerts: string;
}

/**
 * 免费档摘要脱敏：采购内容完整、资格条件截断试读，
 * 竞争格局/投标策略/风险提示/付款周期整段置空（前端渲染为锁定态）。
 */
export function maskSummaryForFree<T extends MaskableSummary>(summary: T): T {
  const masked = { ...summary } as T & Record<string, unknown>;
  for (const dim of SUMMARY_DIMENSIONS) {
    if (FREE_SUMMARY_DIMENSIONS.includes(dim)) continue;
    const previewLen = FREE_SUMMARY_PREVIEW[dim];
    const value = String(summary[dim] ?? "");
    if (previewLen != null && value.length > previewLen) {
      masked[dim] = value.slice(0, previewLen);
    } else if (previewLen == null) {
      masked[dim] = "";
    }
  }
  return masked;
}
