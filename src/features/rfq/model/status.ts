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
  label: string;
  /** 徽章配色（Tailwind 类，含 border） */
  tone: string;
  /** 一句话：现在发生什么 */
  hint: string;
  /** 采购方可在该状态下做的主操作 */
  actions: StatusAction[];
}

const META: Record<string, Omit<StatusMeta, "key">> = {
  [DEMAND_STATUS.DRAFT]: {
    label: "草稿",
    tone: "bg-slate-100 text-slate-600 border-slate-200",
    hint: "尚未提交审核，仅自己可见",
    actions: ["edit", "submit"],
  },
  [DEMAND_STATUS.SUBMITTED]: {
    label: "待审核",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
    hint: "已提交，等待平台审核领取（预计 1 个工作日）",
    actions: ["unsubmit"],
  },
  [DEMAND_STATUS.UNDER_REVIEW]: {
    label: "审核中",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    hint: "审核方已领取，正在核对内容与合规要求",
    actions: [],
  },
  [DEMAND_STATUS.REJECTED]: {
    label: "审核未通过",
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    hint: "按退回意见修改后可重新提交",
    actions: ["edit", "submit"],
  },
  [DEMAND_STATUS.PUBLISHED]: {
    label: "报价中",
    tone: "bg-teal-50 text-teal-700 border-teal-200",
    hint: "已发布，供应商可报价；截止后进入评审",
    actions: ["view", "compare", "withdraw"],
  },
  [DEMAND_STATUS.EVALUATION]: {
    label: "评审中",
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
    hint: "报价已截止，请比价并选定供应商",
    actions: ["compare"],
  },
};

const CLOSED_META: Record<string, Omit<StatusMeta, "key">> = {
  [DEMAND_CLOSE_REASON.CANCELLED]: {
    label: "已撤回",
    tone: "bg-rose-50 text-rose-600 border-rose-200",
    hint: "已撤回，不再对外展示",
    actions: ["copy"],
  },
  [DEMAND_CLOSE_REASON.EXPIRED]: {
    label: "已过期",
    tone: "bg-slate-100 text-slate-500 border-slate-200",
    hint: "报价窗口结束且未选定供应商",
    actions: ["copy"],
  },
  [DEMAND_CLOSE_REASON.AWARDED]: {
    label: "已选定供应商",
    tone: "bg-teal-50 text-teal-700 border-teal-200",
    hint: "定标完成，需求已结案",
    actions: ["view"],
  },
  [DEMAND_CLOSE_REASON.VIOLATED]: {
    label: "已下架",
    tone: "bg-rose-50 text-rose-600 border-rose-200",
    hint: "因合规原因下架",
    actions: ["copy"],
  },
};

/** 关闭态兜底（历史上可能只有 closed 没有原因） */
const CLOSED_FALLBACK: Omit<StatusMeta, "key"> = {
  label: "已关闭",
  tone: "bg-slate-100 text-slate-500 border-slate-200",
  hint: "需求已结案",
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
      label: normalized || "未知状态",
      tone: "bg-slate-100 text-slate-500 border-slate-200",
      hint: "状态未知，请刷新页面",
      actions: [],
    };
  }
  return { key: normalized, ...meta };
}

/** 工作台筛选 Tab（与接口白名单同源） */
export const WORKBENCH_TABS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部" },
  { value: DEMAND_STATUS.DRAFT, label: "草稿" },
  { value: DEMAND_STATUS.SUBMITTED, label: "待审核" },
  { value: DEMAND_STATUS.UNDER_REVIEW, label: "审核中" },
  { value: DEMAND_STATUS.REJECTED, label: "未通过" },
  { value: DEMAND_STATUS.PUBLISHED, label: "报价中" },
  { value: DEMAND_STATUS.EVALUATION, label: "评审中" },
  { value: DEMAND_STATUS.CLOSED, label: "已结案" },
];
