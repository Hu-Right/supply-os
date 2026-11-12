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
  /** 已关闭（用户主动取消/超时未支付；渠道 TRADE_CLOSED 对未付单亦落此态） */
  CLOSED: "closed",
  /** 已退款 */
  REFUNDED: "refunded",
  /** 已过期（培训期次截止；保留迟到付款复活通道） */
  EXPIRED: "expired",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * 在线支付兜底窗（分钟）：下单时统一落 `expires_at = NOW() + 2h`。
 * 刻意宽于网关侧 timeout_express（30 分钟）——DB 若先于渠道关单，会吞掉迟到
 * 到达的支付回调（渠道真扣了钱、DB 已 closed）。清扫见 lifecycle/timers.ts。
 */
export const ORDER_PAY_WINDOW_MINUTES = 120;
