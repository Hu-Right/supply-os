/**
 * 我的记录概览摘要 Hook
 * Records overview summary Hook
 *
 * @module features/payment/hooks/useRecordsSummary
 * @description 为「我的记录」概览态并行拉取「支付订单」与「我的收藏」的总数，
 *              供两张概览卡的数量徽标使用。
 *
 *              2026-11-18 产品调整：「我的可查看采购（解锁记录）」退役，第二张卡
 *              改为「我的收藏」——数据源从 /api/payment/access-records 换成
 *              /api/notices/favorites（收藏为私有书签，已下架公告不计数）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrders, fetchFavoriteRecords } from "../api";

export type UseRecordsSummaryReturn = {
  /** 支付订单总数 */
  ordersTotal: number;
  /** 我的收藏总数 */
  favoritesTotal: number;
  /** 是否加载中 */
  loading: boolean;
  /** 错误信息（null = 成功） */
  error: string | null;
  /** 手动刷新摘要 */
  refresh: () => void;
};

/** 我的记录概览摘要 Hook */
export function useRecordsSummary(userId: number | undefined): UseRecordsSummaryReturn {
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [favoritesTotal, setFavoritesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(() => {
    if (!userId) {
      setOrdersTotal(0);
      setFavoritesTotal(0);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchOrders({ page: 1, limit: 1 }),
      fetchFavoriteRecords({ page: 1, limit: 1 }),
    ])
      .then(([ordersResult, favoritesResult]) => {
        if (seq !== requestSeq.current) return;
        const errors: string[] = [];
        if (ordersResult.status === "fulfilled") {
          setOrdersTotal(Number(ordersResult.value.total || 0));
        } else {
          errors.push("orders");
        }
        if (favoritesResult.status === "fulfilled") {
          setFavoritesTotal(Number(favoritesResult.value.total || 0));
        } else {
          errors.push("favorites");
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
    favoritesTotal,
    loading,
    error,
    refresh: load,
  };
}
