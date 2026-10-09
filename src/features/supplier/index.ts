/**
 * 供应商模块入口
 * Supplier Module Entry
 *
 * @module features/supplier
 * @description 导出页面、跨模块 API 与公共 Hook（组件为内部私有，不导出）
 *              Export pages, cross-module API and public hooks (components are private, not exported)
 */

export { default as SupplierPage } from "./pages/SupplierPage";
// fetchSuppliers（全量拉目录只为填一个行业下拉）已随 facet 接口上线删除，
// 目录全量取数在 CRM 侧走 core/http 直连（见 features/crm/hooks/useCrmData）。
// 供应商联系方式与详情取数的权威实现在 @/shared/api/supplier，此处直接转发（不再经 feature 内壳）
export { fetchSupplierById, fetchSupplierContact } from "@/shared/api/supplier";
export type { SupplierContact, SupplierContactStatus } from "@/shared/api/supplier";
export { SupplierContactModal } from "@/shared/components/SupplierContactModal";
export type { SupplierContactModalProps } from "@/shared/components/SupplierContactModal";
