"use client";

/**
 * (protected)/layout.tsx — 受保护区域布局守卫
 *
 * 未认证用户重定向到 /showroom 并弹出登录框。
 * requireVip 页面（如 CRM）额外检查 VIP 状态。
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { authUser, isVip } = useAuth();
  const router = useRouter();

  const needLogin = !authUser;
  const needVip = !needLogin && !isVip;

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
