/**
 * 行业（industry）归一 — 兼容出口
 *
 * @module server/services/notice-normalize/industry
 * @description 纯词表/映射逻辑已下沉 `@/shared/utils/industry-section`（前端 features 也需要
 *              解析行业码，但分层红线不允许 features import @/lib 服务端模块）。
 *              本文件保留 re-export，既有服务端调用点与测试无需改动。
 */
export {
  INDUSTRY_CANONICALS,
  normalizeIndustry,
  industryDisplayName,
  INDUSTRY_LABELS_ZH,
  INDUSTRY_LABELS_EN,
  type IndustryCanonical,
} from "@/shared/utils/industry-section";
