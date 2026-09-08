/**
 * 供应商搜索分页 Hook
 *
 * @module features/supplier/hooks/useSupplierSearch
 * @description 承载供应商页面的数据获取：服务端分页列表 +
 *              行业下拉选项（独立加载，不阻塞骨架屏）。
 *              支持追加模式（加载更多）和替换模式（筛选/搜索）。
 */
import { useEffect, useState, useCallback } from "react";
import { pickLocale } from "@/core/i18n";
import type { Supplier } from "@/types";
import { fetchSuppliersPaginated, fetchSuppliers } from "../api";

export interface SupplierSearchFilters {
  /** useLocale() 返回的 locale 字符串 */
  locale: string;
  /** 关键词搜索 */
  searchTerm: string;
  /** 国内/国际筛选: "all" | "domestic" | "international" */
  supplierSubTab: "all" | "domestic" | "international";
  /** 行业筛选 */
  supplierIndustry: string;
  /** 排序方式 */
  sortBy?: string;
  /** 每页条数 */
  pageSize?: number;
}

export interface UseSupplierSearchReturn {
  suppliers: Supplier[];
  total: number;
  loading: boolean;
  industries: string[];
  page: number;
  /** 替换模式：筛选/搜索时调用，重置到第1页 */
  setPage: (p: number | ((prev: number) => number)) => void;
  /** 追加模式：加载更多时调用，在现有数据后追加 */
  appendPage: () => void;
  /** 手动刷新 */
  reload: () => void;
}

export function useSupplierSearch({
  locale,
  searchTerm,
  supplierSubTab,
  supplierIndustry,
  sortBy,
  pageSize = 8,
}: SupplierSearchFilters): UseSupplierSearchReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPageState] = useState(1);
  const [industries, setIndustries] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // 追加模式标记：true 时在现有数据后追加，false 时替换
  const [appendMode, setAppendMode] = useState(false);

  // ── 加载行业列表（用于筛选下拉，独立于分页数据，不阻塞骨架屏） ──
  useEffect(() => {
    let cancelled = false;
    fetchSuppliers(locale)
      .then((list) => {
        if (cancelled) return;
        const set = new Set<string>();
        (Array.isArray(list) ? list : []).forEach((s) => {
          const ind = pickLocale(locale, s.industryZh, s.industryEn);
          if (ind) set.add(ind);
        });
        setIndustries(Array.from(set));
      })
      .catch(() => { /* 静默：下拉保持空 */ });
    return () => { cancelled = true; };
  }, [locale]);

  // ─ 服务端分页加载 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSuppliersPaginated(locale, {
      page,
      pageSize,
      q: searchTerm || undefined,
      type: supplierSubTab !== "all" ? supplierSubTab : undefined,
      industry: supplierIndustry || undefined,
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
      .catch(() => {
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
  }, [locale, page, searchTerm, supplierSubTab, supplierIndustry, sortBy, reloadKey, appendMode, pageSize]);

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

  return { suppliers, total, loading, industries, page, setPage, appendPage, reload };
}
