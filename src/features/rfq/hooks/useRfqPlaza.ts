/**
 * 需求广场检索与取数 Hook
 * RFQ Plaza search/data hook
 *
 * @module features/rfq/hooks/useRfqPlaza
 * @description 承载需求广场的筛选状态（关键词/品目大类/排序）、32 大类选项装载、
 *              300ms 防抖请求与列表状态；组件仅负责展示（约定：数据获取统一在 hooks 层）。
 *              原为 RfqPlaza 组件内联逻辑，行为一致。
 *              2026-10-15 G 码退役：大类选项改走树接口（L1 行直出，树名即展示名），
 *              category_l1 的值携带 L1 树码（UGT-xx）。
 *              2026-10-22 交付地点改手动填写地址（仅展示），省份筛选随省市区级联一并退役。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/core/http";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "@/features/procurement/api/commodityTree";
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
  const [categoryL1, setCategoryL1] = useState("");
  const [sort, setSort] = useState<RfqSortKey>("newest");
  const [items, setItems] = useState<PlazaRfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 品目大类选项（骨架 L1 行直出，与商机页五级下拉第一级同源同名）
  const [l1Options, setL1Options] = useState<CommodityTreeOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCommodityTreeChildren("")
      .then((rows) => { if (!cancelled) setL1Options(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setL1Options([]); });
    return () => { cancelled = true; };
  }, []);

  // 构建查询参数（category_l1 携带 L1 树码 UGT-xx）
  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page_size", "24");
    sp.set("sort", sort);
    if (keyword.trim()) sp.set("q", keyword.trim());
    if (categoryL1) sp.set("category_l1", categoryL1);
    return sp.toString();
  }, [keyword, categoryL1, sort]);

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
    categoryL1, setCategoryL1,
    sort, setSort,
    items, loading, total, l1Options,
  };
}
