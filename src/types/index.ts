/**
 * 领域类型统一导出入口
 * Domain Type Barrel Re-export Entry
 *
 * @module types/index
 * @description 聚合全部领域类型（auth / exhibition / supplier / crm / learning / membership / payment / procurement），
 *              外部统一通过 `import type { Xxx } from "@/types"` 引入，保持依赖单向。
 *              Central re-export hub for all domain types. Consumers import via `@/types` for clean, unidirectional dependencies.
 */

export type { ExhibitionHall } from "./exhibition";
export type { Supplier } from "./supplier";
export type { Lead, Opportunity } from "./crm";
export type { LearningMaterial, FAQItem } from "./learning";
export type { AuthUser } from "./auth";
export type {
  PaymentProviderName,
  PaymentMode,
  PaymentOrderStatus,
  PlatformEnv,
  PaymentOrderPlan,
  CreateOrderRequest,
  CreateOrderResult,
  OrderStatusResult,
  PaymentNotifyResult,
  PaymentProviderConfig,
} from "./payment";
export type { NoticeItem, NoticeResponse } from "./procurement";
export type { MembershipPlan, MembershipStatus } from "./membership";
