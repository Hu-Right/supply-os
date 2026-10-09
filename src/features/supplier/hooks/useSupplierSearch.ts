/**
 * 供应商搜索分页 Hook
 *
 * @module features/supplier/hooks/useSupplierSearch
 * @description 承载供应商页面的数据获取：服务端分页列表 +
 *              行业筛选面（crm_industry_nodes 权威树，独立加载，不阻塞骨架屏）。
 *              支持追加模式（加载更多）和替换模式（筛选/搜索）。
 *
 *              行业选项不再靠「拉整页供应商回前端对 industry 文本去重」得到：
 *              那个做法与自由文本同寿命（实测全库 20 种写法，含「其他 / Other」），
 *              而且多拉一份全量 body 只为填一个下拉。现在换成 facet 接口。
 */
import { useEffect, useState, useCallback } from "react";
import type { Supplier } from "@/types";
import { fetchSuppliersPaginated, fetchIndustryFacets, type IndustryFacetGroup } from "../api";

export interface SupplierSearchFilters {
  /** useLocale() 返回的 locale 字符串 */
  locale: string;
  /** 关键词搜索 */
  searchTerm: string;
  /** 页签检索字段：product/company/country/industry/certification/factory/unspsc（缺省=公司名） */
  searchField?: string;
  /** 国内/国际筛选: "all" | "domestic" | "international" */
  supplierSubTab: "all" | "domestic" | "international";
  /** 行业面标准口径筛选码（UGT-I-…，命中子树）；空串=不筛 */
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
  /** 行业筛选面：门类分组 + 大类子项（双语名 + 可见供应商数） */
  industryGroups: IndustryFacetGroup[];
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
  searchField,
  supplierSubTab,
  supplierIndustryCode,
  sortBy,
  pageSize = 8,
}: SupplierSearchFilters): UseSupplierSearchReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPageState] = useState(1);
  const [industryGroups, setIndustryGroups] = useState<IndustryFacetGroup[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // 追加模式标记：true 时在现有数据后追加，false 时替换
  const [appendMode, setAppendMode] = useState(false);

  // ── 加载行业筛选面（与界面语言无关：接口同时返回中英文名，展示侧再 pickLocale）──
  useEffect(() => {
    let cancelled = false;
    fetchIndustryFacets()
      .then((groups) => { if (!cancelled) setIndustryGroups(Array.isArray(groups) ? groups : []); })
      .catch((e) => { console.warn("[useSupplierSearch] 行业筛选面加载失败:", e); });
    return () => { cancelled = true; };
  }, []);

  // ─ 服务端分页加载 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSuppliersPaginated(locale, {
      page,
      pageSize,
      q: searchTerm || undefined,
      field: searchField || undefined,
      type: supplierSubTab !== "all" ? supplierSubTab : undefined,
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
  }, [locale, page, searchTerm, searchField, supplierSubTab, supplierIndustryCode, sortBy, reloadKey, appendMode, pageSize]);

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

  return { suppliers, total, loading, industryGroups, page, setPage, appendPage, reload };
}
