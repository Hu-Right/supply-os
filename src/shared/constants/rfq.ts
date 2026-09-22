/**
 * RFQ 状态机常量
 * @module shared/constants/rfq
 * @description RFQ（需求单）复用 crm_bid_notices 表的 rfq_status 列。
 *              状态值此前以裸字符串散落在多个路由/服务文件（069 迁移注释声明三态，
 *              实际运行时已漂移为四/五态），此文件为唯一收敛点：
 *              写入与比较一律引用 RFQ_STATUS，禁止新的裸字符串。
 *
 * 状态流转：
 *   draft ──submit──→ pending_review ──审核通过──→ published ──withdraw──→ closed
 *                          └──审核拒绝──→ rejected           └──过期关闭──→ closed
 */
export const RFQ_STATUS = {
  /** 草稿（仅创建人可见可编辑） */
  DRAFT: "draft",
  /** 待审核（提交后等待平台/外部后台审核） */
  PENDING_REVIEW: "pending_review",
  /** 已发布（进入需求广场公开可见；由审核方写入） */
  PUBLISHED: "published",
  /** 审核拒绝 */
  REJECTED: "rejected",
  /** 已关闭（撤回或过期） */
  CLOSED: "closed",
} as const;

export type RfqStatus = (typeof RFQ_STATUS)[keyof typeof RFQ_STATUS];

/** 用户侧可筛选的状态白名单（/api/rfq/my?status= 参数校验用） */
export const RFQ_USER_FILTERABLE_STATUSES = [
  RFQ_STATUS.DRAFT,
  RFQ_STATUS.PENDING_REVIEW,
  RFQ_STATUS.PUBLISHED,
  RFQ_STATUS.REJECTED,
  RFQ_STATUS.CLOSED,
] as const;
