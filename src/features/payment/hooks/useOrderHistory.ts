/**
 * 采购记录（订单 / 解锁）历史 Hook
 * Purchase history (orders / access) Hook
 *
 * @module features/payment/hooks/useOrderHistory
 * @description 管理"我的采购记录"面板的 tab 切换、分页与数据加载
 *              Manages tab switching, pagination and data loading for the
 *              "My Purchases" panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { calcTotalPages } from "@/shared/constants/pagination";
import {
  fetchOrders,
  fetchAccessRecords,
  type OrderRecord,
  type AccessRecord,
  type PagedResult,
} from "../api";

/** 面板 tab：支付订单 / 解锁记录 */
export type PurchaseTab = "orders" | "access";

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
  /** 解锁分页数据 */
  accessRecords: PagedResult<AccessRecord> | null;
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

/**
 * 采购记录历史 Hook
 * Purchase history Hook
 */
export function useOrderHistory(userId: number | undefined): UseOrderHistoryReturn {
  const [tab, setTabState] = useState<PurchaseTab>("orders");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<PagedResult<OrderRecord> | null>(null);
  const [accessRecords, setAccessRecords] = useState<PagedResult<AccessRecord> | null>(null);
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
      setAccessRecords(null);
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
        : fetchAccessRecords({ page, limit: PAGE_LIMIT }).then((data) => {
            if (seq === requestSeq.current) setAccessRecords(data);
          });

    request
      .catch(() => {
        if (seq === requestSeq.current) setError("load_failed");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [userId, tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const current = tab === "orders" ? orders : accessRecords;
  const total = Number(current?.total || 0);
  const totalPages = calcTotalPages(total, PAGE_LIMIT);

  return {
    tab,
    setTab,
    page,
    setPage,
    limit: PAGE_LIMIT,
    orders,
    accessRecords,
    loading,
    error,
    total,
    totalPages,
    refresh: load,
  };
}
