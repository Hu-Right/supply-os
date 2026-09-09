// 采购模块
export { default as ProcurementPage } from "./pages/ProcurementPage";
// 行业偏好 API 已迁至 @/core/api/industry-prefs（跨 feature 公共接口）

// 跨 feature 公共 API：供应商资质初筛（被 supplier/SupplierRegisterModal 消费）
export { submitSupplierQualification } from "./api/qualification";
export type { SupplierQualificationForm } from "./api/qualification";
