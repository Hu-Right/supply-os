"use client";
/**
 * 后台运维权限 Hook（ADMIN_EMAILS 白名单，服务端判定）
 * @description 登录后问一次 /api/admin/notice-tagging/access；未登录恒 false。
 *              模块级缓存：一个标签页生命周期内只发一次（导航和页内共用）。
 */
import { useEffect, useState } from "react";
import { fetchTaggingAccess } from "@/core/api/noticeTagging";
import { useUserId } from "@/core/auth/useUserId";

let cached: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

export function useIsAdmin(): boolean {
  const userId = useUserId();
  const [admin, setAdmin] = useState<boolean>(cached ?? false);

  useEffect(() => {
    listeners.add(setAdmin);
    if (cached !== null) return;
    if (!userId) return;
    void fetchTaggingAccess().then((v) => {
      cached = v;
      listeners.forEach((fn) => fn(v));
    });
    return () => {
      listeners.delete(setAdmin);
    };
  }, [userId]);

  return admin;
}
