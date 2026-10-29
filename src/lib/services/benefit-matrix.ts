/**
 * 采购摘要 · 免费档脱敏工具（跨路由复用的纯函数与权益码常量）
 *
 * @module lib/services/benefit-matrix
 * @description 权益门控的单一事实源已收口到 src/lib/repos/benefit-system.repo.ts
 *              （按 plan_benefits 矩阵逐格判定，未订阅一律读 free 列基线）。
 *              本模块只保留两件事，且不再携带任何"档位数字（benefit_rank）"概念：
 *              1. ai_summary 权益码与"完整"层级常量——层级含义的权威定义在库内
 *                 benefit_catalog.level_dict（1=部分脱敏 / 2=完整），此处只引用数字；
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
 * 层级含义的权威定义在库内 benefit_catalog.level_dict
 * （1=部分脱敏 / 2=完整），此处只引用数字不重复写文字，避免文案两处存放。
 * 免费档取 L1：服务端脱敏（高价值维度整段置空），与 xlsx 逐字一致。
 */
export const AI_SUMMARY_BENEFIT = "ai_summary";
export const AI_SUMMARY_FULL_LEVEL = 2;
/** 低于此层级（=0，矩阵声明无此权益的档）完全不展示摘要（只看原文）；=1 脱敏试读（free）；>=2 完整。 */
export const AI_SUMMARY_MIN_VIEW_LEVEL = 1;

/**
 * 公告译文权益码（bool）：/translation、/content 的 description_cn、前端「查看译文」切换的档位门控来源。
 * 矩阵取值（2026-10-28 新矩阵）：全档=1 人人可见；"可配置"=后台改矩阵格子，不做独立开关。
 * 与 ai_summary / ai_match 同属「中文/AI 加工能力」。
 */
export const NOTICE_TRANSLATION_BENEFIT = "notice_translation";

/**
 * 内部语义权益（bool，2026-09-29）：驱动行业可见性墙，不在官网对比表/gates 下发中出现
 * （展示隔离见 BenefitSystemRepo.listBenefits 的黑名单），仅供服务端 isEntitled 判定：
 * - industry_scoped：该档按一级类目收窄数据范围（2026-10-28 新矩阵全档=1，free 列同限，
 *   唯一例外 internal_demo=0；旧矩阵仅 business=1，迁移前行为不变）；
 * - all_category_access：旁路行业限定看全量（internal_demo=1，演示/内部档专用）。
 */
export const INDUSTRY_SCOPED_BENEFIT = "industry_scoped";
export const ALL_CATEGORY_ACCESS_BENEFIT = "all_category_access";

/**
 * 内部计量码（quota，2026-10-28 新矩阵新增）：AI 摘要/AI 匹配的月度次数池。
 * 只被服务端额度池记账消费（unlock-quota 的月度换代池），不进官网对比表与 gates 下发（同一黑名单）。
 * 2026-10-29：industry_addon（行业加购包预留位）已随「无功能实现的额度类权益删除」下线。
 */
export const AI_SUMMARY_QUOTA_BENEFIT = "ai_summary_quota";
export const AI_MATCH_QUOTA_BENEFIT = "ai_match_quota";

export const INTERNAL_MATRIX_BENEFITS = [
  INDUSTRY_SCOPED_BENEFIT,
  ALL_CATEGORY_ACCESS_BENEFIT,
  AI_SUMMARY_QUOTA_BENEFIT,
  AI_MATCH_QUOTA_BENEFIT,
] as const;

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
