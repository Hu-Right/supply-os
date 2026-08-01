/**
 * 布局组件入口
 * Layout Components Entry Point
 *
 * @module shared/layout
 * @description 布局组件统一导出
 *              Unified exports for layout components
 */

export { ProtectedRoute } from "./ProtectedRoute";
export type { ProtectedRouteProps } from "./ProtectedRoute";
export { LanguageSwitcher } from "./LanguageSwitcher";
export { SessionBanner } from "./SessionBanner";
export { AppHeader, useNavTabs } from "./AppHeader";
export type { AppTab, AppHeaderProps } from "./AppHeader";
export { AppFooter } from "./AppFooter";
export type { AppFooterProps } from "./AppFooter";
export { useAppEvents } from "./useAppEvents";
export type { AppEventHandlers } from "./useAppEvents";
export { useVersionCheck } from "./useVersionCheck";
