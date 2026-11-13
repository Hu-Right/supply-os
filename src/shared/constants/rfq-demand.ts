/**
 * RFQ 需求域状态机常量（重构 v2 · 单一事实源）
 * @module shared/constants/rfq-demand
 *
 * @description 与旧 `shared/constants/rfq.ts`（五态，含 pending_review）的关系：
 *              本模块是重构后的权威定义；旧模块在 P1 迁移完成后退役。
 *              `pending_review` 被拆成 `submitted`（用户交完）与 `under_review`（审核方领取），
 *              因为"交了没人看"与"正在看"是两件不同的事，合并后无法计算 SLA、无法催办。
 *
 * 状态流转：
 *   draft ─submit→ submitted ─claim→ under_review ─approve→ published ─close_at→ evaluation ─award→ closed(awarded)
 *     ▲                │                 │                                              └─expire→ closed(expired)
 *     │                │                 └─reject(reason)→ rejected ─submit→ submitted(version+1)
 *     └──revise────────┴─────────────────┴─cancel→ closed(cancelled)
 */
export const DEMAND_STATUS = {
  /** 草稿（仅创建人可见可编辑） */
  DRAFT: "draft",
  /** 已提交，等待审核方领取 */
  SUBMITTED: "submitted",
  /** 审核中（审核方已领取工单） */
  UNDER_REVIEW: "under_review",
  /** 审核退回（理由必填，可修改后重提） */
  REJECTED: "rejected",
  /** 已发布（报价窗口内） */
  PUBLISHED: "published",
  /** 报价截止，评审中（授标或过期关闭） */
  EVALUATION: "evaluation",
  /** 已结案（撤回/过期/授标/违规下架，原因见 close_reason） */
  CLOSED: "closed",
} as const;

export type DemandStatus = (typeof DEMAND_STATUS)[keyof typeof DEMAND_STATUS];

/** 全部状态值（顺序即状态条展示顺序） */
export const DEMAND_STATUS_ORDER: readonly DemandStatus[] = [
  DEMAND_STATUS.DRAFT,
  DEMAND_STATUS.SUBMITTED,
  DEMAND_STATUS.UNDER_REVIEW,
  DEMAND_STATUS.REJECTED,
  DEMAND_STATUS.PUBLISHED,
  DEMAND_STATUS.EVALUATION,
  DEMAND_STATUS.CLOSED,
];

/** 结案原因（closed 状态的细分语义，避免一个状态承担四种含义） */
export const DEMAND_CLOSE_REASON = {
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  AWARDED: "awarded",
  VIOLATED: "violated",
} as const;

export type DemandCloseReason = (typeof DEMAND_CLOSE_REASON)[keyof typeof DEMAND_CLOSE_REASON];

/** 操作者类型（事件流 actor_type） */
export const DEMAND_ACTOR = {
  BUYER: "buyer",
  REVIEWER: "reviewer",
  SYSTEM: "system",
} as const;

export type DemandActor = (typeof DEMAND_ACTOR)[keyof typeof DEMAND_ACTOR];

/** 审核结论 */
export const REVIEW_DECISION = {
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ReviewDecision = (typeof REVIEW_DECISION)[keyof typeof REVIEW_DECISION];

/** 可编辑状态（编辑会生成新版本，并把在审工单标记为过期） */
export const DEMAND_EDITABLE_STATUSES: readonly DemandStatus[] = [
  DEMAND_STATUS.DRAFT,
  DEMAND_STATUS.REJECTED,
];

/** 允许报价的状态 */
export const DEMAND_QUOTABLE_STATUSES: readonly DemandStatus[] = [DEMAND_STATUS.PUBLISHED];

/** 终态 */
export const DEMAND_TERMINAL_STATUSES: readonly DemandStatus[] = [DEMAND_STATUS.CLOSED];

/** 审核 SLA（小时）——提交到出结论 */
export const REVIEW_SLA_HOURS = 24;

/** 评审期（天）——报价截止后到自动过期关闭 */
export const EVALUATION_WINDOW_DAYS = 14;

/** 报价最短窗口（天）——硬下限；小于 7 天仅提示，不阻断 */
export const QUOTE_WINDOW_MIN_DAYS = 1;
export const QUOTE_WINDOW_RECOMMENDED_DAYS = 7;

/** 编号前缀（与爬虫 RFQ- 命名空间隔离） */
export const DEMAND_REFERENCE_PREFIX = "OSRFQ";

/** 用户侧可筛选的状态白名单（/api/rfq/demands/mine?status= 参数校验用） */
export const DEMAND_USER_FILTERABLE_STATUSES: readonly DemandStatus[] = DEMAND_STATUS_ORDER;
