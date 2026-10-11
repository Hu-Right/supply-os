/**
 * 供应商搜索分页 Hook
 *
 * @module features/supplier/hooks/useSupplierSearch
 * @description 承载供应商页面的列表数据获取（服务端分页）。支持追加模式（加载更多）和替换模式（筛选/搜索）。
 *
 *              2026-10-12：行业筛选从「门类 chip + 行业关键词框」改成逐级下拉后，本 hook 只保留
 *              列表侧的三条件：行业码（supplierIndustryCode，级联下拉的最深选中码，子树筛）、
 *              关键词（searchTerm，一个框同时搜公司名 + 产品）、排序（sortBy）。
 *              行业选项（门类 facet + 各级子级）不再在这里装载——它们改由 useIndustryCascade 独立取，
 *              与列表互不阻塞；行业关键词（industry_q）随关键词框一起下线。
 *
 *              关键词框防抖 300ms：它在列表 effect 的依赖里「输入即窄化」，不等一拍就是每按一个字符
 *              一次列表请求。chip / 页签 / 排序 / 级联是离散动作，按一下才一个状态，不防抖。
 */
import { useEffect, useState, useCallback } from "react";
import type { Supplier } from "@/types";
import { fetchSuppliersPaginated } from "../api";

export interface SupplierSearchFilters {
  /** useLocale() 返回的 locale 字符串 */
  locale: string;
  /** 关键词（一个框同时搜公司名 + 产品） */
  searchTerm: string;
  /** 行业主轴：行业码（UGT-I-…，门类/大类/中类/小类任一层级）；空串=不筛 */
  supplierIndustryCode?: string;
  /** 排序方式 */
  sortBy?: string;
  /** 每页条数 */
  pageSize?: number;
}

export interface UseSupplierSearchReturn {
  suppliers: Supplier[];
  total: number;
  loading: boolean;
  page: number;
  /** 替换模式：筛选/搜索时调用，重置到第1页 */
  setPage: (p: number | ((prev: number) => number)) => void;
  /** 追加模式：加载更多时调用，在现有数据后追加 */
  appendPage: () => void;
  /** 手动刷新 */
  reload: () => void;
}

/** 关键词防抖：停手 KEYWORD_DEBOUNCE_MS 后新值才参与取数（输入框自己的值不受影响，仍然是即打即显示） */
const KEYWORD_DEBOUNCE_MS = 300;

function useDebouncedValue(value: string | undefined, delayMs: number): string | undefined {
  const [settled, setSettled] = useState<string | undefined>(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function useSupplierSearch({
  locale,
  searchTerm,
  supplierIndustryCode,
  sortBy,
  pageSize = 8,
}: SupplierSearchFilters): UseSupplierSearchReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPageState] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  // 追加模式标记：true 时在现有数据后追加，false 时替换
  const [appendMode, setAppendMode] = useState(false);

  // 防抖后的关键词才是取数条件（下面的依赖列表用的就是这个 settled 值）
  const searchTermSettled = useDebouncedValue(searchTerm, KEYWORD_DEBOUNCE_MS);

  // ── 服务端分页加载 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSuppliersPaginated(locale, {
      page,
      pageSize,
      q: searchTermSettled || undefined,
      industryCode: supplierIndustryCode || undefined,
      sort: sortBy,
    })
      .then((result) => {
        if (cancelled) return;
        if (appendMode && page > 1) {
          // 追加模式：在现有数据后追加新页
          setSuppliers((prev) => [...prev, ...result.items]);
        } else {
          // 替换模式：筛选/搜索/首页加载
          setSuppliers(result.items);
        }
        setTotal(result.total);
      })
      .catch((e) => {
        console.warn("[SupplierSearch] 供应商搜索失败:", e);
        if (cancelled) return;
        if (!appendMode) {
          setSuppliers([]);
        }
        // 追加失败不清空已有数据
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [locale, page, searchTermSettled, supplierIndustryCode, sortBy, reloadKey, appendMode, pageSize]);

  /** 替换模式 setPage：筛选/搜索时重置到指定页 */
  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    setAppendMode(false);
    if (typeof p === "function") {
      setPageState((prev) => p(prev));
    } else {
      setPageState(p);
    }
  }, []);

  /** 追加模式：加载更多 */
  const appendPage = useCallback(() => {
    setAppendMode(true);
    setPageState((prev) => prev + 1);
  }, []);

  const reload = useCallback(() => {
    setAppendMode(false);
    setPageState(1);
    setReloadKey((k) => k + 1);
  }, []);

  return { suppliers, total, loading, page, setPage, appendPage, reload };
}
