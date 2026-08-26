"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth";

/**
 * (protected)/layout.tsx — 受保护区域布局守卫
 *
 * 未认证用户重定向到 /showroom。
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { authUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authUser) {
      router.replace("/showroom");
    }
  }, [authUser, router]);

  if (!authUser) return null;

  return <>{children}</>;
}
