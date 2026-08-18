/**
 * 领域类型统一导出入口
 * Domain Type Barrel Re-export Entry
 *
 * @module types/index
 * @description 聚合全部领域类型（auth / exhibition / supplier / crm / learning / membership / payment / procurement），
 *              外部统一通过 `import type { Xxx } from "@/types"` 引入，保持依赖单向。
 *              本目录同时是前后端共享 DTO 的单一事实源：server 端允许以 `import type` 引用此处契约；
 *              后端专用类型（策略接口/行类型）必须定义在 server/ 内，不得放入本目录。
 *              Central re-export hub for all domain types and the single source of truth for
 *              shared frontend-backend DTOs. Consumers import via `@/types` for clean, unidirectional dependencies.
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
  OrderInfo,
  OrderStatusResult,
  PaymentNotifyResult,
  PaymentProviderConfig,
} from "./payment";
export type { NoticeItem, NoticeContact, NoticeAttachment, NoticeResponse } from "./procurement";
export type { MembershipPlan, MembershipStatus, UpgradePreview } from "./membership";
