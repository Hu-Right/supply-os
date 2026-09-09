/**
 * 供应商模块入口
 * Supplier Module Entry
 *
 * @module features/supplier
 * @description 导出页面、跨模块 API 与公共 Hook（组件为内部私有，不导出）
 *              Export pages, cross-module API and public hooks (components are private, not exported)
 */

export { default as SupplierPage } from "./pages/SupplierPage";
export { fetchSuppliers, fetchSupplierById, fetchSupplierContact } from "./api";
export type { SupplierContact } from "./api";
export { SupplierContactModal } from "./components/SupplierContactModal";
export type { SupplierContactModalProps, SupplierContactStatus } from "./components/SupplierContactModal";
