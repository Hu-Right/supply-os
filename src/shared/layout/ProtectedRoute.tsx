/**
 * 路由权限守卫
 * Protected Route Component
 *
 * @module shared/layout/ProtectedRoute
 * @description 路由权限守卫（未登录 → 重定向 + 弹窗）
 *              Route permission guard (unauthorized → redirect + modal)
 */

import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";

export interface ProtectedRouteProps {
  children: ReactNode;
  /** 是否需要 VIP */
  requireVip?: boolean;
}

export function ProtectedRoute({
  children,
  requireVip = false,
}: ProtectedRouteProps) {
  const { authUser, isVip } = useAuth();

  if (!authUser) {
    // 触发登录弹窗
    emitAppEvent("supply-os:require-login");
    return <Navigate to="/showroom" replace />;
  }

  if (requireVip && !isVip) {
    // 触发 VIP 升级提示
    emitAppEvent("supply-os:require-vip");
    return <Navigate to="/showroom" replace />;
  }

  return <>{children}</>;
}

ProtectedRoute.displayName = "ProtectedRoute";
