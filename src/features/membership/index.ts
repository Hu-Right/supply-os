/**
 * 会员专区模块入口
 * Membership Zone Module Entry
 *
 * @module features/membership
 * @description 导出页面和公共 Hook（组件为内部私有，不导出）
 *              Export pages and public hooks (components are private, not exported)
 */

export { default as MembershipPage } from "./pages/MembershipPage";

// 数据类型（供外部使用）
export type { VipPrivilege } from "./data";
