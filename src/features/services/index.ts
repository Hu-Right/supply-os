/**
 * 服务生态模块入口
 * Services Ecosystem Module Entry
 *
 * @module features/services
 * @description 导出页面和公共 Hook（组件为内部私有，不导出）
 *              Export pages and public hooks (components are private, not exported)
 */

export { default as ServicesPage } from "./pages/ServicesPage";
export type { ServicesPageProps } from "./pages/ServicesPage";

// 数据类型（供外部使用）
export type { ServiceItem, SuccessStoryItem } from "./types";
