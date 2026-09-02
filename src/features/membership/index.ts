/**
 * 会员专区模块入口
 * Membership Zone Module Entry
 *
 * @module features/membership
 * @description 导出页面、公共 Hook 与被外部模块引用的组件。
 *              Export pages, public hooks, and components referenced by other features.
 */

// 页面
export { default as MembershipPage } from "./pages/MembershipPage";

// Hook：被 auth/AccountPanel 等外部模块引用
export { useMembershipTier } from "./hooks/useMembershipTier";
export type { UseMembershipTierReturn } from "./hooks/useMembershipTier";

// 组件：被 procurement/NoticeDetailSidebar 等外部模块引用
export { MembershipStatusPanel } from "./components/MembershipStatusPanel";
export type { MembershipStatusPanelProps } from "./components/MembershipStatusPanel";
