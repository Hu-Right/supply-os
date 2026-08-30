/**
 * 搜索结果数据加载 Hook
 * Search Results Data Loading Hook
 *
 * @module features/procurement/hooks/search/useSearchResults
 */
import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem, PrefsMode } from "../../types";
import { fetchUnifiedSearch } from "../../api";
import { NOTICE_PAGE_SIZE } from "../../constants";
import type { SearchQuery } from "./useSearchQuery";

export interface SearchResultsOptions {
  query: SearchQuery;
  page: number;
  deepestCodeId: string;
  prefsMode: PrefsMode;
  userKey: string | undefined;
  variantRef: { current: string | undefined };
}

export interface SearchResults {
  items: NoticeItem[];
  total: number;
  serverPageSize: number;
  totalPages: number;
  loading: boolean;
  error: string;
  setError: (message: string) => void;
}

export function useSearchResults(options: SearchResultsOptions): SearchResults {
  const { query, page, deepestCodeId, prefsMode, userKey, variantRef } = options;
  const { locale, t } = useLocale();

  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(NOTICE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const noticesRequestSeq = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SEARCH_TIMEOUT_MS = 15_000;

  const totalPages = Math.max(1, Math.ceil(total / serverPageSize));

  const prevDataSourceForPrefsRef = useRef<string>("initial");
  const prevSearchKeyForSkipRef = useRef<string>("");
  const prevDeepestCodeIdForSkipRef = useRef<string>("");
  // F2 优化：跟踪上一次 searchKey，用于判断是否为纯翻页操作
  const prevSearchKeyForDebounceRef = useRef<string>("");

  useEffect(() => {
    // F1 优化：模式未定时不发请求，避免登录首屏产生废弃请求
    if (prefsMode === "loading") return;

    const currentDataSource =
      prefsMode === "prefs" && userKey
        ? "industry-matched"       // 行业匹配模式：始终走行业匹配 API（携带筛选参数）
        : prefsMode === "recommended" && userKey && !query.hasOtherSearch
          ? "recommended"          // 推荐模式：无筛选时走推荐
          : "search";              // 其他：全量搜索

    const searchKeyUnchanged = prevSearchKeyForSkipRef.current === query.searchKey;
    const dataSourceUnchanged = prevDataSourceForPrefsRef.current === currentDataSource;
    const deepestCodeIdUnchanged = prevDeepestCodeIdForSkipRef.current === deepestCodeId;
    if (dataSourceUnchanged && searchKeyUnchanged && deepestCodeIdUnchanged) {
      return;
    }
    // F2 优化：筛选条件未变 = 纯翻页/排序操作，跳过防抖立即发出
    const isFilterChange = prevSearchKeyForDebounceRef.current !== query.searchKey;
    const debounceMs = isFilterChange ? 150 : 0;
    prevDataSourceForPrefsRef.current = currentDataSource;
    prevSearchKeyForSkipRef.current = query.searchKey;
    prevSearchKeyForDebounceRef.current = query.searchKey;
    prevDeepestCodeIdForSkipRef.current = deepestCodeId;

    abortControllerRef.current?.abort();
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");

    debounceTimerRef.current = setTimeout(() => {
      timeoutTimerRef.current = setTimeout(() => {
        if (requestSeq === noticesRequestSeq.current && !controller.signal.aborted) {
          controller.abort();
          setLoading(false);
          setError(t("procurement_searchTimeout"));
        }
      }, SEARCH_TIMEOUT_MS);

      // 重构方案 §4：单一端点统一调用，数据源差异由 mode 参数表达
      // search→default / industry-matched→prefs / recommended→recommended
      const unifiedMode =
        currentDataSource === "industry-matched" ? "prefs"
        : currentDataSource === "recommended" ? "recommended"
        : "default";
      const request = fetchUnifiedSearch({
        mode: unifiedMode,
        page,
        pageSize: NOTICE_PAGE_SIZE,
        codeId: deepestCodeId || undefined,
        q: query.activeQ || undefined,
        country: query.activeCountry || undefined,
        agency: query.activeAgency || undefined,
        deadlineFrom: query.activeFrom || undefined,
        deadlineTo: query.activeTo || undefined,
        deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
        noticeType: query.activeNoticeType || undefined,
        featured: query.activeFeatured || undefined,
        sort: query.activeSort,
        locale,
      }, controller.signal);

      request
        .then((json) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          const nextPageSize = Number(json.pageSize || json.page_size || NOTICE_PAGE_SIZE);
          variantRef.current = typeof json.variant === "string" ? json.variant : undefined;
          setItems(Array.isArray(json.items) ? json.items : []);
          setTotal(Number(json.total || 0));
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
      prevDeepestCodeIdForSkipRef.current = "";
    };
  }, [deepestCodeId, page, prefsMode, query.searchKey, query.hasOtherSearch, locale, userKey, query.hasSearch]);

  // 分页预取（统一端点）
  // [F4 优化] prefs 模式同样预取：此前因最慢模式无预取导致翻页始终冷请求
  useEffect(() => {
    if (loading || items.length === 0 || page >= totalPages) return;
    // 与主请求的 unifiedMode 计算保持一致（审查 F47）：此前预取只区分
    // recommended/default，行业匹配（prefs）模式下预取 key 与真实翻页
    // 请求不同，预取无效且请求翻倍
    const dataSource =
      prefsMode === "prefs" && userKey
        ? "industry-matched"
        : prefsMode === "recommended" && userKey && !query.hasOtherSearch
          ? "recommended"
          : "search";
    const prefetchMode =
      dataSource === "industry-matched" ? "prefs"
      : dataSource === "recommended" ? "recommended"
      : "default";
    const nextPage = page + 1;
    fetchUnifiedSearch({
      mode: prefetchMode,
      page: nextPage,
      pageSize: NOTICE_PAGE_SIZE,
      codeId: deepestCodeId || undefined,
      q: query.activeQ || undefined,
      country: query.activeCountry || undefined,
      agency: query.activeAgency || undefined,
      deadlineFrom: query.activeFrom || undefined,
      deadlineTo: query.activeTo || undefined,
      deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
      noticeType: query.activeNoticeType || undefined,
      featured: query.activeFeatured || undefined,
      sort: query.activeSort,
      locale,
    }).catch(() => { /* 预取失败静默 */ });
  }, [page, totalPages, items.length, loading, prefsMode, userKey, query.hasOtherSearch, query.searchKey]);

  return {
    items,
    total,
    serverPageSize,
    totalPages,
    loading,
    error,
    setError,
  };
}
