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
    // 检查用户是否绑定了供应商（通过企业信息 API）
    api<{ id?: number }>("/api/user/enterprise")
      .then((res) => setHasSupplier(!!res?.id))
      .catch(() => setHasSupplier(false));
  }, [userId]);

  return hasSupplier;
}
