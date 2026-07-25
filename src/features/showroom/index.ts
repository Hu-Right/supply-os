/**
 * 展厅模块入口
 * Showroom Module Entry
 *
 * @module features/showroom
 * @description 导出页面和公共 Hook（组件为内部私有，不导出）
 *              Export pages and public hooks (components are private, not exported)
 */

export { default as ShowroomPage } from "./pages/ShowroomPage";

// API 类型（供外部使用）
export type { ShowroomRegisterForm } from "./api";
