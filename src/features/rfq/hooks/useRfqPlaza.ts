/**
 * 需求广场检索与取数 Hook
 * RFQ Plaza search/data hook
 *
 * @module features/rfq/hooks/useRfqPlaza
 * @description 承载需求广场的筛选状态（关键词/省份/品目大类/排序）、32 大类选项装载、
 *              300ms 防抖请求与列表状态；组件仅负责展示（约定：数据获取统一在 hooks 层）。
 *              原为 RfqPlaza 组件内联逻辑，行为一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/core/http";
import { COMMODITY_GROUPS, type CommodityGroup } from "@/lib/services/commodity/groups";
import type { PlazaRfq } from "../types";

export type RfqSortKey = "newest" | "deadline" | "budget";

interface ApiResponse {
  items: PlazaRfq[];
  total: number;
  page: number;
  page_size: number;
}

export function useRfqPlaza() {
  const [keyword, setKeyword] = useState("");
  const [province, setProvince] = useState("");
  const [categoryL1, setCategoryL1] = useState("");
  const [sort, setSort] = useState<RfqSortKey>("newest");
  const [items, setItems] = useState<PlazaRfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 品目大类选项（UGT 32 大类常量，与商机页快筛 chip 同源同序，不走网络）
  const l1Options = useMemo<readonly CommodityGroup[]>(() => COMMODITY_GROUPS, []);

  // 构建查询参数（category_l1 现在携带 UGT-G-xx 大类码）
  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page_size", "24");
    sp.set("sort", sort);
    if (keyword.trim()) sp.set("q", keyword.trim());
    if (province) sp.set("province", province);
    if (categoryL1) sp.set("category_l1", categoryL1);
    return sp.toString();
  }, [keyword, province, categoryL1, sort]);

  // 防抖请求
  const fetchList = useCallback(() => {
    setLoading(true);
    api<ApiResponse>(`/api/rfq/list?${queryParams}`)
      .then((res) => {
        setItems(Array.isArray(res.items) ? res.items : []);
        setTotal(Number(res.total) || 0);
      })
      .catch((e) => {
        console.warn("[useRfqPlaza] RFQ 列表加载失败:", e);
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [queryParams]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchList, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchList]);

  return {
    keyword, setKeyword,
    province, setProvince,
    categoryL1, setCategoryL1,
    sort, setSort,
    items, loading, total, l1Options,
  };
}
