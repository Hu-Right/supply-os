/**
 * 搜索结果数据加载 Hook
 * Search Results Data Loading Hook
 *
 * @module features/procurement/hooks/search/useSearchResults
 */
import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/core/i18n";
import { calcTotalPages } from "@/shared/constants/pagination";
import type { NoticeItem, PrefsMode } from "../../types";
import { fetchUnifiedSearch } from "../../api";
import { NOTICE_PAGE_SIZE } from "../../constants";
import type { SearchQuery } from "./useSearchQuery";

export interface SearchResultsOptions {
  query: SearchQuery;
  page: number;
  prefsMode: PrefsMode;
  userId: number | undefined;
  variantRef: { current: string | undefined };
}

export interface SearchResults {
  items: NoticeItem[];
  total: number;
  matchRelaxed: boolean;
  serverPageSize: number;
  totalPages: number;
  loading: boolean;
  error: string;
  setError: (message: string) => void;
}

export function useSearchResults(options: SearchResultsOptions): SearchResults {
  const { query, page, prefsMode, userId, variantRef } = options;
  const { locale, t } = useLocale();

  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [matchRelaxed, setMatchRelaxed] = useState(false);
  const [serverPageSize, setServerPageSize] = useState(NOTICE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const noticesRequestSeq = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 本地 MySQL 降级（MEILI_ENABLED=off / 隧道）冷查询可到 10~20s；
  // 15s 会在服务端即将返回时先 abort，表现为“搜索超时”。给足冷路径预算。
  const SEARCH_TIMEOUT_MS = 30_000;

  const totalPages = calcTotalPages(total, serverPageSize);

  const prevDataSourceForPrefsRef = useRef<string>("initial");
  const prevSearchKeyForSkipRef = useRef<string>("");
  // F2 优化：跟踪上一次 searchKey，用于判断是否为纯翻页操作
  const prevSearchKeyForDebounceRef = useRef<string>("");

  useEffect(() => {
    // F1 优化：模式未定时不发请求，避免登录首屏产生废弃请求
    if (prefsMode === "loading") return;

    const currentDataSource =
      prefsMode === "prefs" && userId
        ? "industry-matched"       // 行业匹配模式：始终走行业匹配 API（携带筛选参数）
        : "search";                // 其他：全量搜索

    const searchKeyUnchanged = prevSearchKeyForSkipRef.current === query.searchKey;
    const dataSourceUnchanged = prevDataSourceForPrefsRef.current === currentDataSource;
    // 不再单独跟踪最深类目 id：五级下拉已改为 URL 事实源，而 searchKey 已含
    // code_id / group / commodity 三项 ⇒ 再留一份局部状态只会出现「URL 与组件态两个真相」。
    if (dataSourceUnchanged && searchKeyUnchanged) {
      return;
    }
    // F2 优化：筛选条件未变 = 纯翻页/排序操作，跳过防抖立即发出
    const isFilterChange = prevSearchKeyForDebounceRef.current !== query.searchKey;
    const debounceMs = isFilterChange ? 150 : 0;
    prevDataSourceForPrefsRef.current = currentDataSource;
    prevSearchKeyForSkipRef.current = query.searchKey;
    prevSearchKeyForDebounceRef.current = query.searchKey;

    abortControllerRef.current?.abort();
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");
    setMatchRelaxed(false);

    debounceTimerRef.current = setTimeout(() => {
      timeoutTimerRef.current = setTimeout(() => {
        if (requestSeq === noticesRequestSeq.current && !controller.signal.aborted) {
          controller.abort();
          setLoading(false);
          setError(t("procurement_searchTimeout"));
        }
      }, SEARCH_TIMEOUT_MS);

      // 重构方案 §4：单一端点统一调用，数据源差异由 mode 参数表达
      // search→default / industry-matched→prefs
      const unifiedMode = currentDataSource === "industry-matched" ? "prefs" : "default";
      const request = fetchUnifiedSearch({
        mode: unifiedMode,
        page,
        pageSize: NOTICE_PAGE_SIZE,
        commodityPath: query.activeCommodity || undefined,
        q: query.activeQ || undefined,
        country: query.activeCountry || undefined,
        deadlineFrom: query.activeFrom || undefined,
        deadlineTo: query.activeTo || undefined,
        deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
        noticeType: query.activeNoticeType || undefined,
        featured: query.activeFeatured || undefined,
        budgetMin: query.activeBudgetMin ? Number(query.activeBudgetMin) : undefined,
        budgetMax: query.activeBudgetMax ? Number(query.activeBudgetMax) : undefined,
        sort: query.activeSort,
        locale,
        matchMode: query.activeMatchMode,
      }, controller.signal);

      request
        .then((json) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          // 分页元数据只认 page_size（服务端已不双发 pageSize；同值别名就是 camel↔snake 桥）。
          const nextPageSize = Number(json.page_size || NOTICE_PAGE_SIZE);
          variantRef.current = typeof json.variant === "string" ? json.variant : undefined;
          setItems(Array.isArray(json.items) ? json.items : []);
          setTotal(Number(json.total || 0));
          setMatchRelaxed(json.matchRelaxed === true);
          setServerPageSize(nextPageSize);
        })
        .catch((err) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          setError(t("procurement_loadFailed"));
        })
        .finally(() => {
          if (requestSeq === noticesRequestSeq.current) {
            setLoading(false);
          }
        });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      controller.abort();
      prevDataSourceForPrefsRef.current = "initial";
      prevSearchKeyForSkipRef.current = "";
      prevSearchKeyForDebounceRef.current = "";
    };
  }, [page, prefsMode, query, locale, userId, t, variantRef]);

  // 分页预取（统一端点）
  // [F4 优化] prefs 模式同样预取：此前因最慢模式无预取导致翻页始终冷请求
  // [2026-10-30 翻页成对卡顿修复] 预取窗口从「仅 page+1」改为 page+1 / page+2 两页：
  //   只向前一页时，命中客户端缓存的那一跳不会再产出新的预取（其实会，但与
  //   主请求的 abort/去重同帧交错，实测下来晚于用户点击），于是链条每两跳断一次 ——
  //   用户感知为「1-2、3-4、5-6 成对快，其余长加载」。多留一页余量后，缓存命中那一跳
  //   也有已热的下一页可用，链条不再断。
  // [去重] 本 effect 依赖 query/t 等引用，重渲染会重放整段副作用（实测同一页被预取
  //   5+ 次）；同一条件集内每页只预取一次，条件/语言变化（effect 重挂载）时重新开放。
  const prefetchedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    prefetchedRef.current.clear();
  }, [query, locale, page]);
  useEffect(() => {
    if (loading || items.length === 0 || page >= totalPages) return;
    // 与主请求的 unifiedMode 计算保持一致
    const dataSource = prefsMode === "prefs" && userId ? "industry-matched" : "search";
    const prefetchMode = dataSource === "industry-matched" ? "prefs" : "default";
    const baseParams = {
      mode: prefetchMode as "default" | "prefs",
      pageSize: NOTICE_PAGE_SIZE,
      commodityPath: query.activeCommodity || undefined,
      q: query.activeQ || undefined,
      country: query.activeCountry || undefined,
      deadlineFrom: query.activeFrom || undefined,
      deadlineTo: query.activeTo || undefined,
      deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
      noticeType: query.activeNoticeType || undefined,
      featured: query.activeFeatured || undefined,
      budgetMin: query.activeBudgetMin ? Number(query.activeBudgetMin) : undefined,
      budgetMax: query.activeBudgetMax ? Number(query.activeBudgetMax) : undefined,
      sort: query.activeSort,
      locale,
      matchMode: query.activeMatchMode,
    };
    for (const offset of [1, 2]) {
      const nextPage = page + offset;
      if (nextPage > totalPages) break;
      if (prefetchedRef.current.has(nextPage)) continue;
      prefetchedRef.current.add(nextPage);
      fetchUnifiedSearch({ ...baseParams, page: nextPage })
        .catch((e) => { console.warn("[useSearchResults] prefetch failed (non-critical):", e); });
    }
  }, [page, totalPages, items.length, loading, prefsMode, userId, query, locale]);

  return {
    items,
    total,
    matchRelaxed,
    serverPageSize,
    totalPages,
    loading,
    error,
    setError,
  };
}

