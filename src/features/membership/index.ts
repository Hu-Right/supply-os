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

// Hook：权威实现已提升至 shared 层，此处 re-export 保持兼容
export { useMembershipTier } from "@/shared/hooks/useMembershipTier";
export type { UseMembershipTierReturn } from "@/shared/hooks/useMembershipTier";
export { useMembershipPayment } from "./hooks/useMembershipPayment";
export type { UseMembershipPaymentOptions } from "./hooks/useMembershipPayment";
export { useMembershipStatus } from "@/shared/hooks/useMembershipStatus";
export type { UseMembershipStatusReturn } from "@/shared/hooks/useMembershipStatus";

// 组件：已提升至 shared（红线 #3 解耦），此处向后兼容 re-export
export { MembershipStatusPanel } from "@/shared/components/MembershipStatusPanel";
export type { MembershipStatusPanelProps } from "@/shared/components/MembershipStatusPanel";
