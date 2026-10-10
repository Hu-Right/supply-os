/**
 * 供应商搜索分页 Hook
 *
 * @module features/supplier/hooks/useSupplierSearch
 * @description 承载供应商页面的数据获取：服务端分页列表 + 行业主轴（门类 facet，
 *              独立加载，不阻塞骨架屏）。支持追加模式（加载更多）和替换模式（筛选/搜索）。
 *
 *              行业选项不再靠「拉整页供应商回前端对 industry 文本去重」得到：
 *              那个做法与自由文本同寿命（实测全库 20 种写法，含「其他 / Other」），
 *              而且多拉一份全量 body 只为填一个下拉。现在换成 facet 接口。
 *
 *              2026-10-10：行业从「一个页签」升为这一页的划分轴，所以三个条件是并列的：
 *              门类码（industryCode）、行业关键词（industryKeyword）、产品/公司关键词（searchTerm）。
 *
 *              两个关键词框都防抖 300ms：它们都在列表 effect 的依赖里「输入即窄化」，
 *              不等一拍就是每按一个字符一次列表请求；行业词框更要多打 1–2 次权威树查询。
 *              chip / 页签 / 排序是离散动作，按一下才一个状态，不防抖。
 */
import { useEffect, useState, useCallback } from "react";
import type { Supplier } from "@/types";
import { fetchSuppliersPaginated, fetchIndustryFacets, type IndustryFacetOption } from "../api";

export interface SupplierSearchFilters {
  /** useLocale() 返回的 locale 字符串 */
  locale: string;
  /** 产品 / 公司关键词 */
  searchTerm: string;
  /** 关键词检索字段：product | company（缺省=公司名） */
  searchField?: string;
  /** 行业主轴：门类码（UGT-I-…）；空串=不筛 */
  supplierIndustryCode?: string;
  /** 行业关键词（大类以下靠它命中）；空串=不筛 */
  industryKeyword?: string;
  /** 排序方式 */
  sortBy?: string;
  /** 每页条数 */
  pageSize?: number;
}

export interface UseSupplierSearchReturn {
  suppliers: Supplier[];
  total: number;
  loading: boolean;
  /** 行业主轴：门类列表（双语名 + 子树内可见供应商数） */
  industrySections: IndustryFacetOption[];
  /**
   * facet 请求是否已落定（成功或失败都算）。
   * ★ 不得用 `industrySections.length === 0` 代替：那个写法把「还在拉」和
   * 「真的没有门类有挂靠 / 接口挂了」混成一种状态，chip 行会永远脉动下去。
   */
  industrySectionsLoaded: boolean;
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
  searchField,
  supplierIndustryCode,
  industryKeyword,
  sortBy,
  pageSize = 8,
}: SupplierSearchFilters): UseSupplierSearchReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPageState] = useState(1);
  const [industrySections, setIndustrySections] = useState<IndustryFacetOption[]>([]);
  const [industrySectionsLoaded, setIndustrySectionsLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 追加模式标记：true 时在现有数据后追加，false 时替换
  const [appendMode, setAppendMode] = useState(false);

  // 防抖后的关键词才是取数条件（下面的依赖列表用的就是这两个 settled 值）
  const searchTermSettled = useDebouncedValue(searchTerm, KEYWORD_DEBOUNCE_MS);
  const industryKeywordSettled = useDebouncedValue(industryKeyword, KEYWORD_DEBOUNCE_MS);

  // ── 加载行业主轴（与界面语言无关：接口同时返回中英文名，展示侧再 pickLocale）──
  // 失败也要把 loaded 置上：facet 挂了不能把页面永久停在骨架 chip 上。
  useEffect(() => {
    let cancelled = false;
    fetchIndustryFacets()
      .then((rows) => {
        if (cancelled) return;
        setIndustrySections(Array.isArray(rows) ? rows : []);
        setIndustrySectionsLoaded(true);
      })
      .catch((e) => {
        console.warn("[useSupplierSearch] 行业主轴加载失败:", e);
        if (!cancelled) setIndustrySectionsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // ── 服务端分页加载 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSuppliersPaginated(locale, {
      page,
      pageSize,
      q: searchTermSettled || undefined,
      field: searchField || undefined,
      industryCode: supplierIndustryCode || undefined,
      industryQ: industryKeywordSettled || undefined,
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
  }, [locale, page, searchTermSettled, searchField, supplierIndustryCode, industryKeywordSettled, sortBy, reloadKey, appendMode, pageSize]);

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

  return { suppliers, total, loading, industrySections, industrySectionsLoaded, page, setPage, appendPage, reload };
}
