/**
 * 搜索结果数据加载 Hook
 * Search Results Data Loading Hook
 *
 * @module features/procurement/hooks/search/useSearchResults
 */
import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem, PrefsMode } from "../../types";
import { fetchNotices, fetchRecommendedNotices, fetchIndustryMatchedNotices } from "../../api";
import { PAGE_SIZE } from "../searchFormReducer";
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
  const { locale } = useLocale();

  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
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

  useEffect(() => {
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
    prevDataSourceForPrefsRef.current = currentDataSource;
    prevSearchKeyForSkipRef.current = query.searchKey;
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
          setError("搜索超时，请稍后重试");
        }
      }, SEARCH_TIMEOUT_MS);

      const request =
        currentDataSource === "search"
          ? fetchNotices({
              page,
              pageSize: PAGE_SIZE,
              codeId: deepestCodeId || undefined,
              q: query.activeQ || undefined,
              country: query.activeCountry || undefined,
              agency: query.activeAgency || undefined,
              deadlineFrom: query.activeFrom || undefined,
              deadlineTo: query.activeTo || undefined,
              sort: query.activeSort,
              userKey: userKey || undefined,
              deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
              noticeType: query.activeNoticeType || undefined,
              featured: query.activeFeatured || undefined,
              locale,
            }, controller.signal)
          : currentDataSource === "industry-matched"
            ? fetchIndustryMatchedNotices({
                userKey: userKey || "", page, pageSize: PAGE_SIZE, locale,
                // 透传全部筛选参数到行业匹配 API
                q: query.activeQ || undefined,
                country: query.activeCountry || undefined,
                agency: query.activeAgency || undefined,
                deadlineFrom: query.activeFrom || undefined,
                deadlineTo: query.activeTo || undefined,
                deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
                noticeType: query.activeNoticeType || undefined,
                featured: query.activeFeatured || undefined,
                sort: query.activeSort,
              }, controller.signal)
            : fetchRecommendedNotices({ userKey: userKey || "", page, pageSize: PAGE_SIZE, locale }, controller.signal);

      request
        .then((json) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          const nextPageSize = Number(json.pageSize || json.page_size || PAGE_SIZE);
          variantRef.current = typeof json.variant === "string" ? json.variant : undefined;
          setItems(Array.isArray(json.items) ? json.items : []);
          setTotal(Number(json.total || 0));
          setServerPageSize(nextPageSize);
        })
        .catch((err) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          setError("Failed to load procurement notices.");
        })
        .finally(() => {
          if (requestSeq === noticesRequestSeq.current) {
            setLoading(false);
          }
        });
    }, 150);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      controller.abort();
      prevDataSourceForPrefsRef.current = "initial";
      prevSearchKeyForSkipRef.current = "";
      prevDeepestCodeIdForSkipRef.current = "";
    };
  }, [deepestCodeId, page, prefsMode, query.searchKey, query.hasOtherSearch, locale, userKey, query.hasSearch]);

  // 分页预取
  useEffect(() => {
    if (prefsMode === "prefs") return;
    if (loading || items.length === 0 || page >= totalPages) return;
    const nextPage = page + 1;
    fetchNotices({
      page: nextPage,
      pageSize: PAGE_SIZE,
      codeId: deepestCodeId || undefined,
      q: query.activeQ || undefined,
      country: query.activeCountry || undefined,
      agency: query.activeAgency || undefined,
      deadlineFrom: query.activeFrom || undefined,
      deadlineTo: query.activeTo || undefined,
      sort: query.activeSort,
      userKey: userKey || undefined,
      deadlineWithinDays: query.activeWindow ? Number(query.activeWindow) : undefined,
      noticeType: query.activeNoticeType || undefined,
      featured: query.activeFeatured || undefined,
      locale,
    }).catch(() => { /* 预取失败静默 */ });
  }, [page, totalPages, items.length, loading, prefsMode]);

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
