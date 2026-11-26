/**
 * 商品定价解析 — 入口
 * @module lib/payment/products
 */
export type {
  ResolvedProduct,
  ProductResolution,
  ProductUnavailableReason,
  ProductPriceSource,
} from "./types";
export {
  planProductOf,
  serviceProductOf,
  fetchServicePriceRow,
  courseProductOf,
  type PlanPriceInput,
  type ServicePriceInput,
  type CoursePriceInput,
} from "./resolve";
