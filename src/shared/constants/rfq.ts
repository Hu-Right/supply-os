/**
 * RFQ 状态机常量
 * @module shared/constants/rfq
 * @description 收敛此前散落在路由/组件中的 rfq_status 裸字符串（crm_bid_notices.rfq_status，
 *              仅 notice_type='RFQ' 使用）。069 迁移注释声明 draft/published/closed 三态，
 *              实际链路新增 pending_review（提交待审）与 rejected（审核驳回）。
 */
export const RFQ_STATUS = {
  /** 草稿：用户保存未提交 */
  DRAFT: "draft",
  /** 待审核：用户已提交，等待管理端审核 */
  PENDING_REVIEW: "pending_review",
  /** 已发布：审核通过，进入需求广场公开可见 */
  PUBLISHED: "published",
  /** 已驳回：审核不通过 */
  REJECTED: "rejected",
  /** 已关闭：用户撤回 */
  CLOSED: "closed",
} as const;

export type RfqStatus = (typeof RFQ_STATUS)[keyof typeof RFQ_STATUS];
