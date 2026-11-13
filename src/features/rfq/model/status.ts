/**
 * RFQ 状态描述符（唯一事实源）
 * @module features/rfq/model/status
 *
 * @description 重构前状态文案散在三处（`shared/constants/rfq.ts`、工作台 `STATUS_MAP`、
 *              详情页 `STATUS_LABELS`），且各自只认识旧五态。本模块是前端唯一出口：
 *              7 态 + `closed` 的四种结案子态，每一态都给出「现在发生什么 / 下一步做什么」。
 */
import { DEMAND_STATUS, DEMAND_CLOSE_REASON } from "@/shared/constants/rfq-demand";

export type StatusAction = "edit" | "submit" | "unsubmit" | "withdraw" | "view" | "copy" | "quote" | "compare";

export interface StatusMeta {
  /** 原始状态（闭合态附带原因时形如 closed:awarded） */
  key: string;
  /** 状态下显示的 i18n 键（消费方用 t(labelKey) 渲染） */
  labelKey: string;
  /** 徽章配色（Tailwind 类，含 border） */
  tone: string;
  /** 一句话：现在发生什么（i18n 键，消费方 t(hintKey)） */
  hintKey: string;
  /** 采购方可在该状态下做的主操作 */
  actions: StatusAction[];
}

const META: Record<string, Omit<StatusMeta, "key">> = {
  [DEMAND_STATUS.DRAFT]: {
    labelKey: "rfqDemandStatusDraft",
    tone: "bg-slate-100 text-slate-600 border-slate-200",
    hintKey: "rfqDemandStatusDraftHint",
    actions: ["edit", "submit"],
  },
  [DEMAND_STATUS.SUBMITTED]: {
    labelKey: "rfqDemandStatusSubmitted",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
    hintKey: "rfqDemandStatusSubmittedHint",
    actions: ["unsubmit"],
  },
  [DEMAND_STATUS.UNDER_REVIEW]: {
    labelKey: "rfqDemandStatusUnderReview",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    hintKey: "rfqDemandStatusUnderReviewHint",
    actions: [],
  },
  [DEMAND_STATUS.REJECTED]: {
    labelKey: "rfqDemandStatusRejected",
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    hintKey: "rfqDemandStatusRejectedHint",
    actions: ["edit", "submit"],
  },
  [DEMAND_STATUS.PUBLISHED]: {
    labelKey: "rfqDemandStatusPublished",
    tone: "bg-teal-50 text-teal-700 border-teal-200",
    hintKey: "rfqDemandStatusPublishedHint",
    actions: ["view", "compare", "withdraw"],
  },
  [DEMAND_STATUS.EVALUATION]: {
    labelKey: "rfqDemandStatusEvaluation",
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
    hintKey: "rfqDemandStatusEvaluationHint",
    actions: ["compare"],
  },
};

const CLOSED_META: Record<string, Omit<StatusMeta, "key">> = {
  [DEMAND_CLOSE_REASON.CANCELLED]: {
    labelKey: "rfqDemandStatusCancelled",
    tone: "bg-rose-50 text-rose-600 border-rose-200",
    hintKey: "rfqDemandStatusCancelledHint",
    actions: ["copy"],
  },
  [DEMAND_CLOSE_REASON.EXPIRED]: {
    labelKey: "rfqDemandStatusExpired",
    tone: "bg-slate-100 text-slate-500 border-slate-200",
    hintKey: "rfqDemandStatusExpiredHint",
    actions: ["copy"],
  },
  [DEMAND_CLOSE_REASON.AWARDED]: {
    labelKey: "rfqDemandStatusAwarded",
    tone: "bg-teal-50 text-teal-700 border-teal-200",
    hintKey: "rfqDemandStatusAwardedHint",
    actions: ["view"],
  },
  [DEMAND_CLOSE_REASON.VIOLATED]: {
    labelKey: "rfqDemandStatusViolated",
    tone: "bg-rose-50 text-rose-600 border-rose-200",
    hintKey: "rfqDemandStatusViolatedHint",
    actions: ["copy"],
  },
};

/** 关闭态兜底（历史上可能只有 closed 没有原因） */
const CLOSED_FALLBACK: Omit<StatusMeta, "key"> = {
  labelKey: "rfqDemandStatusClosed",
  tone: "bg-slate-100 text-slate-500 border-slate-200",
  hintKey: "rfqDemandStatusClosedHint",
  actions: ["copy"],
};

/** 旧五态 → 新七态的兼容映射（读旧数据/旧接口时用） */
const LEGACY_ALIASES: Record<string, string> = {
  pending_review: DEMAND_STATUS.SUBMITTED,
};

export function normalizeStatus(status: string): string {
  return LEGACY_ALIASES[status] ?? status;
}

/** 取状态描述符；`closeReason` 只对 closed 生效 */
export function statusMeta(status: string, closeReason?: string | null): StatusMeta {
  const normalized = normalizeStatus(status);
  if (normalized === DEMAND_STATUS.CLOSED) {
    const reason = String(closeReason ?? "");
    const meta = CLOSED_META[reason] ?? CLOSED_FALLBACK;
    return { key: `closed:${reason || "unknown"}`, ...meta };
  }
  const meta = META[normalized];
  if (!meta) {
    return {
      key: normalized,
      labelKey: normalized || "rfqDemandStatusUnknown",
      tone: "bg-slate-100 text-slate-500 border-slate-200",
      hintKey: "rfqDemandStatusUnknownHint",
      actions: [],
    };
  }
  return { key: normalized, ...meta };
}

/** 工作台筛选 Tab（与接口白名单同源）；labelKey 由消费方 t() 渲染 */
export const WORKBENCH_TABS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "rfqTabAll" },
  { value: DEMAND_STATUS.DRAFT, labelKey: "rfqTabDraft" },
  { value: DEMAND_STATUS.SUBMITTED, labelKey: "rfqTabSubmitted" },
  { value: DEMAND_STATUS.UNDER_REVIEW, labelKey: "rfqTabUnderReview" },
  { value: DEMAND_STATUS.REJECTED, labelKey: "rfqTabRejected" },
  { value: DEMAND_STATUS.PUBLISHED, labelKey: "rfqTabPublished" },
  { value: DEMAND_STATUS.EVALUATION, labelKey: "rfqTabEvaluation" },
  { value: DEMAND_STATUS.CLOSED, labelKey: "rfqTabClosed" },
];
