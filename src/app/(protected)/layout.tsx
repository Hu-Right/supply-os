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
  const { authUser, isVip, authReady } = useAuth();
  const router = useRouter();

  const needLogin = !authUser;
  const needVip = !needLogin && !isVip;

  useEffect(() => {
    // ★ 认证初始化未完成前不做路由守卫判断，避免 localStorage 恢复期间的误重定向 ★
    if (!authReady) return;
    if (needLogin) {
      emitAppEvent("supply-os:require-login");
      router.replace("/showroom");
    } else if (needVip) {
      emitAppEvent("supply-os:require-vip");
      router.replace("/showroom");
    }
  }, [authReady, needLogin, needVip, router]);

  // 初始化期间显示加载指示（不渲染子组件，避免闪烁）
  if (!authReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-teal-500" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }
  if (needLogin || needVip) return null;

  return <>{children}</>;
}
