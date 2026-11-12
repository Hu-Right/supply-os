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
  resolveLearningProduct,
  courseProductOf,
  type PlanPriceInput,
  type ServicePriceInput,
  type MaterialPriceInput,
  type CoursePriceInput,
} from "./resolve";
