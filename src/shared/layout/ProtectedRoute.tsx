/**
 * 路由权限守卫
 * Protected Route Component
 *
 * @module shared/layout/ProtectedRoute
 * @description 路由权限守卫（未登录 → 重定向 + 弹窗）
 *              Route permission guard (unauthorized → redirect + modal)
 */

import { useEffect, type ReactNode } from "react";
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
  const needLogin = !authUser;
  const needVip = !needLogin && requireVip && !isVip;

  // 弹窗事件属于副作用，必须放在提交后的 effect 中派发，
  // 避免渲染期派发导致 StrictMode 双触发与重复弹窗
  useEffect(() => {
    if (needLogin) {
      // 触发登录弹窗
      emitAppEvent("supply-os:require-login");
    } else if (needVip) {
      // 触发 VIP 升级提示
      emitAppEvent("supply-os:require-vip");
    }
  }, [needLogin, needVip]);

  if (needLogin) {
    return <Navigate to="/showroom" replace />;
  }

  if (needVip) {
    return <Navigate to="/showroom" replace />;
  }

  return <>{children}</>;
}

ProtectedRoute.displayName = "ProtectedRoute";
