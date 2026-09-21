/**
 * 权益门控单一事实源（SSOT）
 * Benefit matrix — single source of truth for feature gating
 *
 * @module lib/services/benefit-matrix
 * @description 对齐《云境产品服务权益报价表_260921_V2.xlsx》定稿矩阵：
 *              免费注册(0) → 个人体验版129(1) → 个人标准版999(2) → 个人专业版1299(3) → 企业年度会员8800(4)。
 *
 *              档位来源：crm_membership_plans.benefit_rank（migration 090），
 *              经 resolveMembershipState().currentBest.benefit_rank 解析（单次卡不授予档位，仅给额度，§2.0 R1 同源）。
 *              公告详情六模块、前端标签、后端闸门一律读本模块，禁止再各自拼装判断。
 *
 *              采购摘要特殊：rank0 可访问但服务端脱敏（仅采购内容完整+资格条件概要，
 *              竞争格局/投标策略/风险提示/付款周期四个高价值维度为付费内容）。
 *              摘要/评分生成走用户 BYOK 大模型凭证（resolveLlmCredentials），平台无边际成本。
 */

/** 权益档位（与 crm_membership_plans.benefit_rank 一致） */
export const BENEFIT_RANK = {
  /** 免费注册体验：脱敏摘要 + 相似机会 */
  FREE: 0,
  /** 个人体验版 129/年：10 单额度 */
  TRIAL: 1,
  /** 个人标准版 999/年：100 单 + 历史中标 */
  STANDARD: 2,
  /** 个人专业版 1299/年：不限 + AI 适配评分 */
  PRO: 3,
  /** 企业年度会员 8800/年：专业版全部 + 企业画像版评分 */
  ENTERPRISE: 4,
} as const;

/** 需要档位门控的功能点 */
export type PlanFeature =
  | "summary"
  | "similar"
  | "qualification"
  | "files"
  | "award_history"
  | "ai_score";

/**
 * 各功能所需最低档位。
 * - summary/similar：免费可用（summary 由路由层按 rank 脱敏）；
 * - qualification/files：档位 0 即可访问，实际门控是"解锁"语义（计订单额度），
 *   前端徽标按"未付费→会员"展示，与解锁闸门（executeUnlock 402/403）配合；
 * - award_history：标准版起（矩阵：999 档 + 历史中标）；
 * - ai_score：专业版起（矩阵：1299 档 + AI 适配评分；企业绑定账号自动走企业画像版）。
 */
export const FEATURE_REQUIRED_RANK: Record<PlanFeature, number> = {
  summary: BENEFIT_RANK.FREE,
  similar: BENEFIT_RANK.FREE,
  qualification: BENEFIT_RANK.FREE,
  files: BENEFIT_RANK.FREE,
  award_history: BENEFIT_RANK.STANDARD,
  ai_score: BENEFIT_RANK.PRO,
};

/** 判断某档位是否可用某功能 */
export function hasFeature(benefitRank: number, feature: PlanFeature): boolean {
  return benefitRank >= FEATURE_REQUIRED_RANK[feature];
}

/**
 * 用户当前权益档位。
 * currentBest 为空（无周期性套餐）即免费档；单次卡持有者同样为免费档（R1 身份与额度分离）。
 */
export function resolveBenefitRank(currentBest: { benefit_rank?: number } | null | undefined): number {
  return Number(currentBest?.benefit_rank ?? 0);
}

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

// ── 权益对比矩阵（展示层 SSOT）────────────────────────────────────────────
// 与上方 FEATURE_REQUIRED_RANK 同源：对比表每行的档位判定一律经本模块，
// 禁止在组件里再各自拼装。分组表头复用已有 i18n 键；行标签暂以中文字面兑底
// （V2 新增文案的六语本地化待专轮复核，见 i18n 六语言包一致性规范）。

export interface ComparisonRow {
  key: string;
  /** 分组：core 基础权益 / advanced AI 与进阶权益 */
  group: "core" | "advanced";
  /** 优先复用的已有 i18n 键（存在则组件走 t()） */
  i18nKey?: string;
  /** 中文兑底标签（无对应 i18n 键时直接展示） */
  label: string;
  /** 布尔门控来源：读 FEATURE_REQUIRED_RANK（与后端闸门完全一致） */
  feature?: PlanFeature;
  /** 非 feature 型门槛（如中文解析报告/行业推送/企业画像）：rank >= minRank 即可 */
  minRank?: number;
  /** 特殊渲染：额度数字 / 有效期（非布尔） */
  render?: "quota" | "validity";
}

/** 对比矩阵行定义（报价表 V2 定稿：档位递增、高层权益包含低层）。 */
export const COMPARISON_ROWS: ComparisonRow[] = [
  { key: "quota", group: "core", i18nKey: "comparisonUnlockQuota", label: "解锁额度", render: "quota" },
  { key: "validity", group: "core", i18nKey: "comparisonValidity", label: "有效期", render: "validity" },
  { key: "summary", group: "core", label: "AI 采购摘要", feature: "summary" },
  { key: "similar", group: "core", label: "相似机会推荐", feature: "similar" },
  { key: "qualification", group: "core", label: "资格条件查看", feature: "qualification" },
  { key: "files", group: "core", i18nKey: "comparisonDocDownload", label: "原始文件下载", feature: "files" },
  { key: "award_history", group: "core", label: "历史中标查询", feature: "award_history" },
  { key: "report", group: "advanced", i18nKey: "comparisonReport", label: "中文解析报告", minRank: BENEFIT_RANK.PRO },
  { key: "ai_score", group: "advanced", label: "AI 适配评分", feature: "ai_score" },
  { key: "industry_push", group: "advanced", label: "按行业精准推送", minRank: BENEFIT_RANK.PRO },
  { key: "enterprise_profile", group: "advanced", label: "企业画像智能匹配", minRank: BENEFIT_RANK.ENTERPRISE },
  { key: "consortium", group: "advanced", label: "参与联合体投标", minRank: BENEFIT_RANK.ENTERPRISE },
];

/**
 * 判定某档位对某行布尔权益是否启用。
 * quota/validity 行返回 true（由调用方按数字/文本特列渲染）。
 */
export function comparisonRowEnabled(rank: number, row: ComparisonRow): boolean {
  if (row.render) return true;
  if (row.feature) return hasFeature(rank, row.feature);
  if (row.minRank != null) return rank >= row.minRank;
  return true;
}
