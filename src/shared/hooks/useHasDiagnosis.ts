/**
 * 检查用户是否已完成资质诊断
 * @module shared/hooks/useHasDiagnosis
 * @description 供诊断引导卡（DiagnosisGuideCard）等场景判断「该主体是否已有诊断记录」：
 *              取 GET /api/supplier-diagnosis/mine 的 list 按 supplierId 比对，
 *              不带 supplierId 时退化为「有无任意诊断记录」。
 *              取数语义与 useHasSupplierPool 一致：cancelled 守卫防卸载后 setState、
 *              暴露 error/retry；catch 不重置 hasDiagnosis，显隐交由调用方按 loading/error 兜底。
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/http";
import { onAppEvent } from "@/core/events";

interface MineRow {
  supplierId: number;
}

export function useHasDiagnosis(
  userId: number | undefined,
  supplierId: number | undefined,
): {
  hasDiagnosis: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [hasDiagnosis, setHasDiagnosis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId || !supplierId) {
      setHasDiagnosis(false);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ list?: MineRow[] }>("/api/supplier-diagnosis/mine")
      .then((res) => {
        if (cancelled) return;
        const list = res?.list;
        setHasDiagnosis(!!list && list.some((r) => Number(r.supplierId) === Number(supplierId)));
      })
      .catch((e) => {
        if (cancelled) return;
        // 不重置 hasDiagnosis：保留上一次成功值，交由调用方在 loading/error 期间兜底显隐
        setError(e instanceof Error ? e.message : "load-failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, supplierId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  // 跨实例同步：换绑/解绑（企业变更）或新诊断提交后，所有订阅者即时重取。
  // 事件仅由写操作端点派发（非取数本身），不会形成回环。
  useEffect(() => {
    const offEnt = onAppEvent("supply-os:enterprise-changed", () => setNonce((n) => n + 1));
    const offDiag = onAppEvent("supply-os:diagnosis-changed", () => setNonce((n) => n + 1));
    // 跨标签页：提交诊断的标签页会写 localStorage 标记，其余标签页通过 storage 事件重取
    const onStorage = (e: StorageEvent) => {
      if (e.key === "supply-os:diagnosis-updated") setNonce((n) => n + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      offEnt();
      offDiag();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { hasDiagnosis, loading, error, retry };
}
