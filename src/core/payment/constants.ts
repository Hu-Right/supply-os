/**
 * 支付轮询共享常量
 * Shared Payment Polling Constants
 *
 * @module core/payment/constants
 * @description 统一 PaymentModalCore 与 useNoticePayment 的轮询参数，
 *              消除两处实现不一致（原 200 vs 80 次上限）导致的行为分化。
 */

/** 轮询间隔（毫秒）：3 秒 */
export const PAYMENT_POLL_INTERVAL_MS = 3000;

/** 轮询上限（200 次 × 3s ≈ 10 分钟），防止订单永不 paid 时无限轮询 */
export const PAYMENT_POLL_MAX_ATTEMPTS = 200;
