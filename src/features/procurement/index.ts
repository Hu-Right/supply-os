// 采购模块
export { default as ProcurementPage } from "./pages/ProcurementPage";
// 品目智能推断 API 在 @/core/api/commoditySmartInfer（跨 feature 公共接口）；
// 「主营行业」偏好 API 已于 2026-11-12 随该功能整体下线。

// 供应商能力诊断 v2 的接口层在 @/shared/api/diagnosis，页面直接引用（旧版初筛问卷已随 v1 退役）

// AI 拆标摘要
export { useAiAnalysis } from "./hooks/useAiAnalysis";
export type { UseAiAnalysisReturn } from "./hooks/useAiAnalysis";
