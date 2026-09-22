/**
 * 需求广场检索与取数 Hook
 * RFQ Plaza search/data hook
 *
 * @module features/rfq/hooks/useRfqPlaza
 * @description 承载需求广场的筛选状态（关键词/省份/行业/排序）、UNSPSC 一级分类加载、
 *              300ms 防抖请求与列表状态；组件仅负责展示（约定：数据获取统一在 hooks 层）。
 *              原为 RfqPlaza 组件内联逻辑，行为一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/core/http";
import { fetchUnspscIndustries, type UnspscOption } from "@/core/unspsc";
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
  const [l1Options, setL1Options] = useState<UnspscOption[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载 UNSPSC 一级分类
  useEffect(() => {
    fetchUnspscIndustries().then(setL1Options).catch((e) => { console.warn("[useRfqPlaza] UNSPSC 分类加载失败:", e); setL1Options([]); });
  }, []);

  // 构建查询参数
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
