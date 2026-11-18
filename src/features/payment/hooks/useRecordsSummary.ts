/**
 * 采购记录概览摘要 Hook
 * Purchase records overview summary Hook
 *
 * @module features/payment/hooks/useRecordsSummary
 * @description 为"我的采购记录"概览态并行拉取订单/解锁的总数与首条记录，
 *              用于概览卡的数量徽标与首条预览，避免污染分页 hook。
 *              Fetches order/access totals and the first record in parallel for
 *              the overview cards' count badge and first-record preview, keeping
 *              the pagination hook clean.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrders, fetchAccessRecords, type OrderRecord, type AccessRecord } from "../api";

export type UseRecordsSummaryReturn = {
  /** 订单总数 */
  ordersTotal: number;
  /** 解锁总数 */
  accessTotal: number;
  /** 首条订单记录（无则 null） */
  ordersFirst: OrderRecord | null;
  /** 首条解锁记录（无则 null） */
  accessFirst: AccessRecord | null;
  /** 是否加载中 */
  loading: boolean;
  /** 错误信息（null = 成功） */
  error: string | null;
  /** 手动刷新摘要 */
  refresh: () => void;
};

/**
 * 采购记录概览摘要 Hook
 * Purchase records overview summary Hook
 */
export function useRecordsSummary(userId: number | undefined): UseRecordsSummaryReturn {
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [accessTotal, setAccessTotal] = useState(0);
  const [ordersFirst, setOrdersFirst] = useState<OrderRecord | null>(null);
  const [accessFirst, setAccessFirst] = useState<AccessRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(() => {
    if (!userId) {
      setOrdersTotal(0);
      setAccessTotal(0);
      setOrdersFirst(null);
      setAccessFirst(null);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchOrders({ page: 1, limit: 1 }),
      fetchAccessRecords({ page: 1, limit: 1 }),
    ])
      .then(([ordersResult, accessResult]) => {
        if (seq !== requestSeq.current) return;
        const errors: string[] = [];
        if (ordersResult.status === "fulfilled") {
          setOrdersTotal(Number(ordersResult.value.total || 0));
          setOrdersFirst(ordersResult.value.list?.[0] ?? null);
        } else {
          errors.push("orders");
        }
        if (accessResult.status === "fulfilled") {
          setAccessTotal(Number(accessResult.value.total || 0));
          setAccessFirst(accessResult.value.list?.[0] ?? null);
        } else {
          errors.push("accessRecords");
        }
        if (errors.length > 0) {
          setError(`${errors.join(", ")} 加载失败`);
        }
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ordersTotal,
    accessTotal,
    ordersFirst,
    accessFirst,
    loading,
    error,
    refresh: load,
  };
}
