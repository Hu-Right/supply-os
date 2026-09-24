// 采购模块
export { default as ProcurementPage } from "./pages/ProcurementPage";
// 行业偏好 API 已迁至 @/core/api/industry-prefs（跨 feature 公共接口）

// 供应商能力诊断 v2 的接口层在 @/shared/api/diagnosis，页面直接引用（旧版初筛问卷已随 v1 退役）

// AI 拆标摘要
export { useAiAnalysis } from "./hooks/useAiAnalysis";
export type { UseAiAnalysisReturn } from "./hooks/useAiAnalysis";
