/**
 * 支付履约统一入口 — 向后兼容 re-export
 * Payment fulfillment unified entry — backward-compatible re-export
 *
 * @module lib/payment/fulfillment
 * @description ARCH-P3a（2026-08-31）：按场景拆分为 4 个独立模块：
 *              - activate.ts: 真实支付履约 + 订阅开通
 *              - upgrade.ts: 会员升级履约
 *              - mock.ts: Mock 支付履约
 *              - reverse.ts: 退款逆向回收
 *              本文件改为 re-export barrel 保持存量导入路径兼容。
 *              新代码应直接从对应子模块导入。
 */

// 真实支付履约 + 订阅开通
export { activatePaidOrder, activateSubscription } from "./activate";

// 会员升级履约
export { fulfillUpgradeOrder, performUpgradeInTransaction } from "./upgrade";

// Mock 支付履约
export { fulfillMockPayment } from "./mock";

// 退款逆向回收
export { reverseFulfilledOrder } from "./reverse";
