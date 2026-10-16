/**
 * 行业码制工具 — 兼容 shim（实现已下沉 shared/constants/industry-code）
 *
 * @module lib/services/industry-code
 * @description 2026-10 分层治理：features 客户端需要同一码形判定，而红线 3 禁止
 *              import `@/lib/**`；纯码形层按红线 1 通道下沉 shared/constants，
 *              本文件只保留历史导入面（lib 内部消费方与测试的路径不变），
 *              不再承载任何实现。新增消费方一律直引
 *              `@/shared/constants/industry-code`，不得再往本文件加逻辑。
 */
export {
  INDUSTRY_CODE_PREFIX,
  NAV_INDUSTRIES_LEVELS,
  isIndustryCode,
  industryLevelOf,
  industryAncestorCodes,
  industrySubtreeLike,
  minimalSubtreePrefixes,
  sanitizeIndustryCode,
} from "@/shared/constants/industry-code";
export type { IndustryLevel, IndustryNavLevel } from "@/shared/constants/industry-code";
