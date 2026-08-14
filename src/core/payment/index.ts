/**
 * 支付工具层入口
 * Payment Utility Layer Entry Point
 *
 * @module core/payment
 * @description 统一导出支付工具函数（环境检测、平台判断等）
 *              Unified exports for payment utility functions (env detection, platform detection)
 */

export {
  detectPlatformEnv,
  isMobile,
  isDesktop,
  getAvailableProviders,
  getPaymentTips,
  fetchPaymentConfigStatus,
  isProviderConfigured,
  mapPaymentError,
} from "./env-detector";
export type { PaymentConfigStatus } from "./env-detector";
