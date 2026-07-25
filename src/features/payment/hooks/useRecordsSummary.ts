/**
 * 采购记录概览摘要 Hook
 * Purchase records overview summary Hook
 *
 * @module features/payment/hooks/useRecordsSummary
 * @description 为"我的采购记录"概览态并行拉取订单/解锁的总数与首条记录，
 *              用于概览卡的数量徽标与首条预览，避免污染分页 hook。
 *              Fetches order/unlock totals and the first record in parallel for
 *              the overview cards' count badge and first-record preview, keeping
 *              the pagination hook clean.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrders, fetchUnlocks, type OrderRecord, type UnlockRecord } from "../api";

export type UseRecordsSummaryReturn = {
  /** 订单总数 */
  ordersTotal: number;
  /** 解锁总数 */
  unlocksTotal: number;
  /** 首条订单记录（无则 null） */
  ordersFirst: OrderRecord | null;
  /** 首条解锁记录（无则 null） */
  unlocksFirst: UnlockRecord | null;
  /** 是否加载中 */
  loading: boolean;
  /** 手动刷新摘要 */
  refresh: () => void;
};

/**
 * 采购记录概览摘要 Hook
 * Purchase records overview summary Hook
 */
export function useRecordsSummary(userKey: string | undefined): UseRecordsSummaryReturn {
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [unlocksTotal, setUnlocksTotal] = useState(0);
  const [ordersFirst, setOrdersFirst] = useState<OrderRecord | null>(null);
  const [unlocksFirst, setUnlocksFirst] = useState<UnlockRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(() => {
    if (!userKey) {
      setOrdersTotal(0);
      setUnlocksTotal(0);
      setOrdersFirst(null);
      setUnlocksFirst(null);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);

    Promise.allSettled([
      fetchOrders({ userKey, page: 1, limit: 1 }),
      fetchUnlocks({ userKey, page: 1, limit: 1 }),
    ])
      .then(([ordersResult, unlocksResult]) => {
        if (seq !== requestSeq.current) return;
        if (ordersResult.status === "fulfilled") {
          setOrdersTotal(Number(ordersResult.value.total || 0));
          setOrdersFirst(ordersResult.value.list?.[0] ?? null);
        }
        if (unlocksResult.status === "fulfilled") {
          setUnlocksTotal(Number(unlocksResult.value.total || 0));
          setUnlocksFirst(unlocksResult.value.list?.[0] ?? null);
        }
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [userKey]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ordersTotal,
    unlocksTotal,
    ordersFirst,
    unlocksFirst,
    loading,
    refresh: load,
  };
}
