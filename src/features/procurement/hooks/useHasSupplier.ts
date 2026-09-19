/**
 * 检查用户是否绑定了供应商
 * @module features/procurement/hooks/useHasSupplier
 */
import { useEffect, useState } from "react";
import { api } from "@/core/http";

export function useHasSupplier(userId: number | undefined): boolean {
  const [hasSupplier, setHasSupplier] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasSupplier(false);
      return;
    }
    // 检查用户是否绑定了企业（供应商主体）：/api/user/enterprise 返回 { code, message, data: { bound } }，
    // 身份字段在 data.bound（顶层无 id）——此前误读 res.id 恒为 undefined，导致 hasSupplier 永远 false，
    // 企业账号也错显「AI 智能匹配」卡片（点击后被后端身份互斥 403 拒绝）。
    api<{ code: number; data: { bound: boolean } }>("/api/user/enterprise")
      .then((res) => setHasSupplier(!!res?.data?.bound))
      .catch(() => setHasSupplier(false));
  }, [userId]);

  return hasSupplier;
}
