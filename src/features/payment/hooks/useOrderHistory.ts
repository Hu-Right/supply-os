/**
 * 我的记录（订单 / 收藏）历史 Hook
 * My records (orders / favorites) history Hook
 *
 * @module features/payment/hooks/useOrderHistory
 * @description 管理「我的记录」面板的 tab 切换、分页与数据加载。
 *
 *              2026-11-18 产品调整：第二个 tab 从「可查看采购（解锁记录）」改为
 *              「我的收藏」，数据源 /api/notices/favorites（按收藏时间倒序；
 *              服务端 INNER JOIN notice_public，已下架公告不返回）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import { calcTotalPages } from "@/shared/constants/pagination";
import {
  fetchOrders,
  fetchFavoriteRecords,
  type OrderRecord,
  type FavoriteRecord,
  type PagedResult,
} from "../api";

/** 面板 tab：支付订单 / 我的收藏 */
export type PurchaseTab = "orders" | "favorites";

/** 每页条数 */
const PAGE_LIMIT = 10;

export type UseOrderHistoryReturn = {
  /** 当前 tab */
  tab: PurchaseTab;
  /** 切换 tab（自动回到第 1 页） */
  setTab: (tab: PurchaseTab) => void;
  /** 当前页码 */
  page: number;
  /** 切换页码 */
  setPage: (page: number) => void;
  /** 每页条数 */
  limit: number;
  /** 订单分页数据 */
  orders: PagedResult<OrderRecord> | null;
  /** 收藏分页数据 */
  favorites: PagedResult<FavoriteRecord> | null;
  /** 是否加载中 */
  loading: boolean;
  /** 错误消息 */
  error: string;
  /** 当前 tab 总条数 */
  total: number;
  /** 当前 tab 总页数 */
  totalPages: number;
  /** 手动刷新当前 tab */
  refresh: () => void;
};

/** 我的记录历史 Hook */
export function useOrderHistory(userId: number | undefined): UseOrderHistoryReturn {
  const { locale } = useLocale();
  const [tab, setTabState] = useState<PurchaseTab>("orders");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<PagedResult<OrderRecord> | null>(null);
  const [favorites, setFavorites] = useState<PagedResult<FavoriteRecord> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);

  const setTab = useCallback((next: PurchaseTab) => {
    setTabState(next);
    setPage(1);
  }, []);

  const load = useCallback(() => {
    if (!userId) {
      setOrders(null);
      setFavorites(null);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError("");

    const request =
      tab === "orders"
        ? fetchOrders({ page, limit: PAGE_LIMIT }).then((data) => {
            if (seq === requestSeq.current) setOrders(data);
          })
        : fetchFavoriteRecords({ page, limit: PAGE_LIMIT, locale }).then((data) => {
            if (seq === requestSeq.current) setFavorites(data);
          });

    request
      .catch(() => {
        if (seq === requestSeq.current) setError("load_failed");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [userId, tab, page, locale]);

  useEffect(() => {
    load();
  }, [load]);

  const current = tab === "orders" ? orders : favorites;
  const total = Number(current?.total || 0);
  const totalPages = calcTotalPages(total, PAGE_LIMIT);

  return {
    tab,
    setTab,
    page,
    setPage,
    limit: PAGE_LIMIT,
    orders,
    favorites,
    loading,
    error,
    total,
    totalPages,
    refresh: load,
  };
}
