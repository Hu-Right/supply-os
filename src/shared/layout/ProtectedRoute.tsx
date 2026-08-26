/**
 * 路由权限守卫
 * Protected Route Component
 *
 * @module shared/layout/ProtectedRoute
 * @description 路由权限守卫（未登录 → 重定向 + 弹窗）
 *              Route permission guard (unauthorized → redirect + modal)
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const needLogin = !authUser;
  const needVip = !needLogin && requireVip && !isVip;

  useEffect(() => {
    if (needLogin) {
      emitAppEvent("supply-os:require-login");
      router.replace("/showroom");
    } else if (needVip) {
      emitAppEvent("supply-os:require-vip");
      router.replace("/showroom");
    }
  }, [needLogin, needVip, router]);

  if (needLogin || needVip) return null;

  return <>{children}</>;
}

ProtectedRoute.displayName = "ProtectedRoute";
