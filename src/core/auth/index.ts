/**
 * 认证模块入口
 * Auth Module Entry Point
 *
 * @module core/auth
 * @description 统一导出认证上下文和类型
 *              Unified exports for auth context and types
 */

export { AuthProvider, useAuth, useOptionalAuth } from "./AuthContext";
export { useUserId } from "./useUserId";
export type { AuthUser, AuthContextValue, SupplierClaimForm, RegisterOptions } from "./types";
