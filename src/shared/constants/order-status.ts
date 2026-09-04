/**
 * 订单状态常量
 * Order Status Constants
 *
 * @module shared/constants/order-status
 * @description 统一全库散落的订单状态字符串字面量（"pending" / "paid" / "closed" 等），
 *              避免新增/修改状态值时需要逐个文件搜索替换。
 *              SQL 内的状态字面量属于 DB 契约，不在此列。
 */

export const ORDER_STATUS = {
  /** 待支付 */
  PENDING: "pending",
  /** 已支付 */
  PAID: "paid",
  /** 已关闭（用户主动取消/超时未支付） */
  CLOSED: "closed",
  /** 已退款 */
  REFUNDED: "refunded",
  /** 已过期 */
  EXPIRED: "expired",
  /** 支付失败 */
  FAILED: "failed",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
