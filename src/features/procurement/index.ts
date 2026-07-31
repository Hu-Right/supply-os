// 采购模块
export { default as ProcurementPage } from "./pages/ProcurementPage";
// 行业偏好 API（AuthModal 跨 feature 使用，经 barrel 暴露）
export { fetchIndustryPrefs, saveIndustryPrefs } from "./api";
