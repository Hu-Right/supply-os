/**
 * 公采公告搜索 Hook
 * Notice Search Hook
 *
 * @module features/procurement/hooks/useNoticeSearch
 * @description 采购公告列表的搜索栏 + URL 参数事实源 + 分页 + 多维过滤状态，
 *              以及 fetchNotices 数据源编排。URL 搜索参数为生效条件唯一事实源，
 *              表单输入为待提交草稿。
 *              Notice search bar + URL-param source of truth + pagination +
 *              multi-dimensional filter state, plus fetchNotices orchestration.
 */
import { useCallback, useEffect, useRef, useReducer, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import { clearApiCache } from "@/core/http";
import type { NoticeItem, PrefsMode } from "../types";
import { fetchNotices, fetchRecommendedNotices } from "../api";
import { searchFormReducer, PAGE_SIZE, type SearchFormState, type SearchFormAction } from "./searchFormReducer";
import { useSearchDropdowns } from "./useSearchDropdowns";

export { PAGE_SIZE } from "./searchFormReducer";

export interface UseNoticeSearchOptions {
  /** 当前登录用户 key（用于搜索行为落库与推荐数据源门控） */
  userKey: string | undefined;
  /** 当前页码（Page 持有，与行业筛选联动共享） */
  page: number;
  /** 页码设置器（搜索提交/清空时重置为 1） */
  setPage: (page: number) => void;
  /** UNSPSC 级联最深行业码，作为 fetchNotices 的 code_id 过滤 */
  deepestCodeId: string;
  /** 自动筛选模式（行业偏好三级降级状态机），决定列表数据源 */
  prefsMode: PrefsMode;
  /** 手动搜索即退出 prefs/recommended 自动模式 */
  setPrefsMode: (mode: PrefsMode) => void;
  /** 清空当前选中详情（搜索提交时重置详情态） */
  setSelectedNotice: (notice: NoticeItem | null) => void;
  /** 推荐响应 A/B 桶标记 ref（列表加载时写入，反馈埋点读取，T-B10） */
  variantRef: { current: string | undefined };
  /** BUG1 修复：clearSearch 时额外回调——用于重置 UNSPSC 行业筛选等跨 hook 状态 */
  onClear?: () => void;
}

export interface UseNoticeSearchReturn {
  /** URL 生效条件（唯一事实源） */
  query: {
    activeQ: string;
    activeCountry: string;
    activeAgency: string;
    activeFrom: string;
    activeTo: string;
    activeSort: "deadline" | "latest" | "deadline_farthest";
    activeWindow: string;
    activeNoticeType: string;
    activeFeatured: boolean;
    hasSearch: boolean;
    searchKey: string;
  };
  /** 表单草稿（待提交） */
  form: {
    qInput: string;
    setQInput: (value: string) => void;
    countryInput: string;
    setCountryInput: (value: string) => void;
    agencyInput: string;
    setAgencyInput: (value: string) => void;
    fromInput: string;
    setFromInput: (value: string) => void;
    toInput: string;
    setToInput: (value: string) => void;
    windowInput: string;
    setWindowInput: (value: string) => void;
    typeInput: string;
    setTypeInput: (value: string) => void;
  };
  /** 列表数据 */
  result: {
    countries: Array<{ country: string; count: number }>;
    agencies: Array<{ agency: string; count: number }>;
    items: NoticeItem[];
    total: number;
    serverPageSize: number;
    totalPages: number;
    loading: boolean;
    error: string;
    setError: (message: string) => void;
  };
  /** 动作 */
  actions: {
    applySearch: (sortOverride?: "deadline" | "latest" | "deadline_farthest") => void;
    clearSearch: () => void;
    /** T-A4：只看精选开关（立即生效写 URL，保留其余现有条件） */
    toggleFeatured: () => void;
  };
}

export function useNoticeSearch(options: UseNoticeSearchOptions): UseNoticeSearchReturn {
  const {
    userKey,
    page,
    setPage,
    deepestCodeId,
    prefsMode,
    setPrefsMode,
    setSelectedNotice,
    variantRef,
    onClear,
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale } = useLocale();
  const { countries, agencies } = useSearchDropdowns();

  const [formState, dispatchForm] = useReducer(searchFormReducer, {
    q: searchParams.get("q") || "",
    country: searchParams.get("country") || "",
    agency: searchParams.get("agency") || "",
    from: searchParams.get("deadline_from") || "",
    to: searchParams.get("deadline_to") || "",
    window: searchParams.get("deadline_within_days") || "",
    type: searchParams.get("notice_type") || "",
  });
  const setQInput = useCallback((v: string) => dispatchForm({ type: "set_q", payload: v }), []);
  const setCountryInput = useCallback((v: string) => dispatchForm({ type: "set_country", payload: v }), []);
  const setAgencyInput = useCallback((v: string) => dispatchForm({ type: "set_agency", payload: v }), []);
  const setFromInput = useCallback((v: string) => dispatchForm({ type: "set_from", payload: v }), []);
  const setToInput = useCallback((v: string) => dispatchForm({ type: "set_to", payload: v }), []);
  const setWindowInput = useCallback((v: string) => dispatchForm({ type: "set_window", payload: v }), []);
  const setTypeInput = useCallback((v: string) => dispatchForm({ type: "set_type", payload: v }), []);
  const { q: qInput, country: countryInput, agency: agencyInput, from: fromInput, to: toInput,
    window: windowInput, type: typeInput } = formState;

  // ── URL 参数事实源 ──
  const activeQ = searchParams.get("q") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeAgency = searchParams.get("agency") || "";
  const activeFrom = searchParams.get("deadline_from") || "";
  const activeTo = searchParams.get("deadline_to") || "";
  const rawSort = searchParams.get("sort");
  const activeSort: "deadline" | "latest" | "deadline_farthest" =
    rawSort === "latest" ? "latest" : rawSort === "deadline" ? "deadline" : "deadline_farthest";
  const activeWindow = searchParams.get("deadline_within_days") || "";
  const activeNoticeType = searchParams.get("notice_type") || "";
  const activeFeatured = searchParams.get("featured") === "1";
  // 修复：hasSearch 纳入 deepestCodeId——UNSPSC 行业筛选也是有效筛选条件，
  // 必须参与数据源三选一判定。否则仅激活行业偏好（无文本/国家/日期等条件）时
  // hasSearch=false，导致：
  //   - 最近/最新 → activeSort !== "deadline_farthest" → "search"（带 codeId 筛选）
  //   - 最远优先 → 回退到 "default"/"recommended"（无 codeId 筛选）
  // 三种排序走不同数据源，total 差异巨大（如 6.8 万 vs 12.1 万）。
  // 纳入 deepestCodeId 后，只要行业筛选激活，三种排序统一走 "search" 数据源，
  // 服务端 COUNT 查询不含 ORDER BY，total 必然一致。
  const hasSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured || deepestCodeId
  );
  // BUG6 修复：searchKey 纳入 deepestCodeId，行业筛选变化时触发分页重置与数据重载
  const searchKey = `${activeQ}|${activeCountry}|${activeAgency}|${activeFrom}|${activeTo}|${activeSort}|${activeWindow}|${activeNoticeType}|${activeFeatured ? "1" : ""}|${deepestCodeId}`;
  // 修复：searchKeyForSkip 纳入 deepestCodeId，确保行业偏好加载完成后触发新请求
  // 原逻辑排除 deepestCodeId 导致页面刷新时行业偏好加载后不触发搜索
  const searchKeyForSkip = searchKey;

  // URL 外部变化时同步表单草稿
  useEffect(() => {
    dispatchForm({
      type: "sync",
      payload: { q: activeQ, country: activeCountry, agency: activeAgency, from: activeFrom, to: activeTo,
        window: activeWindow, type: activeNoticeType },
    });
  }, [activeQ, activeCountry, activeAgency, activeFrom, activeTo, activeWindow, activeNoticeType]);

  // 组件挂载时立即从 URL 同步表单状态（确保刷新后输入框与 URL 参数一致）
  // 这是对上方 sync effect 的补充，确保首次渲染时表单状态与 URL 参数完全同步
  useEffect(() => {
    dispatchForm({
      type: "sync",
      payload: { q: activeQ, country: activeCountry, agency: activeAgency, from: activeFrom, to: activeTo,
        window: activeWindow, type: activeNoticeType },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-1: 搜索条件变化时主动清除缓存
  // 避免 30s TTL 内来回切换筛选器时命中过期缓存返回错误数据
  // PERF 优化：仅在用户主动提交搜索时清除（applySearch/clearSearch），
  // URL 参数被动变化（如翻页、支付回跳）不清除，保留服务端缓存命中
  const prevSearchKeyForCacheRef = useRef(searchKey);
  const userSubmittedRef = useRef(false);
  useEffect(() => {
    if (prevSearchKeyForCacheRef.current !== searchKey) {
      prevSearchKeyForCacheRef.current = searchKey;
      if (userSubmittedRef.current) {
        // 用户主动提交搜索时才清除缓存
        clearApiCache("/api/notices?");
        userSubmittedRef.current = false;
      }
    }
  }, [searchKey]);

  // BUG: 账号切换时主动清除缓存
  // searchKey 不含 userKey，账号切换时 searchKey 不变，上方 effect 不会触发清缓存，
  // 导致旧用户 apiCached 数据（30s TTL）泄漏给新用户
  // 回滚：删除下方 useEffect 即可
  const prevUserKeyForCacheRef = useRef(userKey);
  useEffect(() => {
    if (prevUserKeyForCacheRef.current !== userKey) {
      prevUserKeyForCacheRef.current = userKey;
      clearApiCache("/api/notices?");
    }
  }, [userKey]);

  // 生效条件变化时重置分页
  // （支付回跳清参、前进/后退到搜索直达链接）不经过动作函数，旧页码会请求到
  // 空页误显"无匹配结果"。applySearch 路径重复置 1 为幂等无副作用。
  const prevSearchKeyRef = useRef(searchKey);
  useEffect(() => {
    if (prevSearchKeyRef.current === searchKey) return;
    prevSearchKeyRef.current = searchKey;
    setPage(1);
  }, [searchKey, setPage]);

  // 提交搜索
  const applySearch = (sortOverride?: "deadline" | "latest" | "deadline_farthest") => {
    userSubmittedRef.current = true;

    const next: Record<string, string> = {};
    if (qInput.trim()) next.q = qInput.trim();
    if (countryInput) next.country = countryInput;
    if (agencyInput) next.agency = agencyInput;
    if (fromInput) next.deadline_from = fromInput;
    if (toInput) next.deadline_to = toInput;
    if (windowInput) next.deadline_within_days = windowInput;
    if (typeInput.trim()) next.notice_type = typeInput.trim();
    if (activeFeatured) next.featured = "1";
    if (deepestCodeId) next.code_id = deepestCodeId;
    const sortValue = sortOverride ?? activeSort;
    if (sortValue !== "deadline_farthest") next.sort = sortValue;
    if (prefsMode !== "default") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    setSearchParams(next);
  };

  const toggleFeatured = () => {
    const next = new URLSearchParams(searchParams);
    if (activeFeatured) next.delete("featured");
    else next.set("featured", "1");
    if (prefsMode !== "default") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    setSearchParams(next);
  };

  const clearSearch = () => {
    dispatchForm({ type: "clear" });
    setPage(1);
    setSearchParams({});
    // BUG1 修复：同步清除 UNSPSC 行业筛选等跨 hook 状态
    onClear?.();
    // PERF 优化：不再立即清空列表和设置 loading——由 effect 统一处理
    userSubmittedRef.current = true;
  };

  // ── 列表数据与加载编排 ──
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const noticesRequestSeq = useRef(0);

  // P0 性能优化：搜索防抖 + AbortController——减少无效请求、取消过期请求
  // PERF 优化：防抖 150ms——Meilisearch 响应时间 <10ms，300ms 防抖过度增加用户感知延迟
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // PERF 优化：搜索超时控制——15 秒无响应自动取消，防止蒙层永久显示
  const SEARCH_TIMEOUT_MS = 15_000;
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / serverPageSize));

  // BUG 修复：当 prefsMode 变化但数据源和搜索条件均未变时，跳过 effect 避免取消进行中的请求
  // 根因：prefsMode 从 "loading"→"default" 不改变数据源（都是 fetchNotices 默认模式），
  // 但 effect 重跑递增 requestSeq，导致第一次快速响应被丢弃
  // 注意：searchKey/page/deepestCodeId 等变化时不受此守卫影响，仍会发新请求
  // 回滚：删除 prevDataSourceForPrefsRef/prevSearchKeyForSkipRef 及相关守卫逻辑
  const prevDataSourceForPrefsRef = useRef<string>("initial");
  const prevSearchKeyForSkipRef = useRef<string>("");

  useEffect(() => {
    // 统一数据源判定逻辑（方案B）：
    // - 有筛选条件 → "search"（标准搜索 API）
    // - 无筛选 + 推荐模式 → "recommended"（推荐 API）
    // - 无筛选 + 非推荐模式 → "search"（标准搜索 API，全量）
    // 关键改进：移除 activeSort 条件，排序方式不影响数据源判定
    // 原逻辑：hasSearch || activeSort !== "deadline_farthest" → 排序方式影响数据源
    // 导致：三种排序走不同数据源，total 不一致（6.8万 vs 12.1万）
    // 修复后：三种排序统一走相同数据源，total 必然一致
    const currentDataSource =
      hasSearch
        ? "search"
        : prefsMode === "recommended" && userKey
          ? "recommended"
          : "search";

    // 精确守卫：仅当数据源 AND 搜索条件均未变时跳过
    // 典型场景：prefsMode 从 "loading"→"default"，数据源和搜索条件都不变
    // page/searchKey/deepestCodeId 等变化时，搜索条件变了，不会跳过
    // 修复：searchKeyForSkip 现在包含 deepestCodeId，确保行业偏好加载后触发新请求
    const searchKeyUnchanged = prevSearchKeyForSkipRef.current === searchKeyForSkip;
    if (prevDataSourceForPrefsRef.current === currentDataSource && searchKeyUnchanged) {
      // 数据源和搜索条件均未变 → 保留进行中的请求，不发新请求
      return;
    }
    prevDataSourceForPrefsRef.current = currentDataSource;
    prevSearchKeyForSkipRef.current = searchKeyForSkip;

    // 取消前一次未完成的请求（AbortController）
    abortControllerRef.current?.abort();
    // PERF 优化：清除之前的超时定时器
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");

    // PERF 优化：防抖 150ms，减少用户感知延迟（Meilisearch 响应 <10ms，无需 300ms 保守值）
    // AbortController 已保证旧请求被取消，不会造成服务端压力
    debounceTimerRef.current = setTimeout(() => {
      // PERF 优化：设置搜索超时——防止服务端慢导致蒙层永久显示
      timeoutTimerRef.current = setTimeout(() => {
        if (requestSeq === noticesRequestSeq.current && !controller.signal.aborted) {
          controller.abort();
          setLoading(false);
          setError("搜索超时，请稍后重试");
        }
      }, SEARCH_TIMEOUT_MS);

      // 统一数据源：search（标准搜索）或 recommended（推荐）
      // 原逻辑有三个分支（search/recommended/default），现在合并为两个
      // "search" 和 "default" 本质相同，都调用 fetchNotices，只是参数不同
      // 统一后：无筛选条件时，fetchNotices 的所有筛选参数都是 undefined，等效于原 "default"
      const request =
        currentDataSource === "search"
          ? fetchNotices({
              page,
              pageSize: PAGE_SIZE,
              codeId: deepestCodeId || undefined,
              q: activeQ || undefined,
              country: activeCountry || undefined,
              agency: activeAgency || undefined,
              deadlineFrom: activeFrom || undefined,
              deadlineTo: activeTo || undefined,
              sort: activeSort,
              userKey: userKey || undefined,
              deadlineWithinDays: activeWindow ? Number(activeWindow) : undefined,
              noticeType: activeNoticeType || undefined,
              featured: activeFeatured || undefined,
              locale,
            }, controller.signal)
          : fetchRecommendedNotices({ userKey, page, pageSize: PAGE_SIZE, locale }, controller.signal);

      request
        .then((json) => {
          if (requestSeq !== noticesRequestSeq.current) return;
          // PERF 优化：请求成功，清除超时定时器
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
          // AbortError 是主动取消或超时，不视为错误（超时时已设置错误信息）
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          setError("Failed to load procurement notices.");
        })
        .finally(() => {
          // BUG 修复：无论请求是否被取消，都要重置 loading 状态
          // 原逻辑在 abort 时跳过 setLoading(false)，导致蒙层永久显示
          if (requestSeq === noticesRequestSeq.current) {
            setLoading(false);
          }
        });
    }, 150);

    // 清理：依赖变化时清除定时器 + 取消请求
    // BUG 修复：重置 refs 以兼容 React StrictMode（开发模式 effect 双重执行）
    // 不重置 refs 时，第二次执行会误判为"数据源未变"而跳过请求
    // 回滚：删除 refs 重置逻辑
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      controller.abort();
      // StrictMode 兼容：重置 refs，确保第二次执行不被守卫拦截
      prevDataSourceForPrefsRef.current = "initial";
      prevSearchKeyForSkipRef.current = "";
    };
    // searchKey 覆盖 q/country/日期区间/排序/多维过滤等 URL 参数（本地差异 #6 + #13）
    // locale 纳入依赖：用户切换语言时需重新请求以获取对应译文
    // userKey 纳入依赖：登录/注册后数据源需按身份重新获取（偏好/推荐/行为落库）
    // BUG-5 修复：hasSearch 纳入依赖，确保数据源分支变更时 effect 正确重跑
  }, [deepestCodeId, page, prefsMode, searchKey, locale, userKey, hasSearch]);

  // P1 性能优化：分页预取——当前页加载完成后静默预取下一页到 apiCached 缓存
  // 用户点击翻页时直接命中缓存，0ms 等待
  // 回滚：删除下方 useEffect 即可
  useEffect(() => {
    // 仅当当前页有数据且不是最后一页时预取
    if (loading || items.length === 0 || page >= totalPages) return;
    const nextPage = page + 1;
    // 静默预取：不更新 UI，仅填充 apiCached 缓存
    fetchNotices({
      page: nextPage,
      pageSize: PAGE_SIZE,
      codeId: deepestCodeId || undefined,
      q: activeQ || undefined,
      country: activeCountry || undefined,
      agency: activeAgency || undefined,
      deadlineFrom: activeFrom || undefined,
      deadlineTo: activeTo || undefined,
      sort: activeSort,
      userKey: userKey || undefined,
      deadlineWithinDays: activeWindow ? Number(activeWindow) : undefined,
      noticeType: activeNoticeType || undefined,
      featured: activeFeatured || undefined,
      locale,
    }).catch(() => { /* 预取失败静默，不影响当前页 */ });
  }, [page, totalPages, items.length, loading]);

  return {
    query: {
      activeQ,
      activeCountry,
      activeAgency,
      activeFrom,
      activeTo,
      activeSort,
      activeWindow,
      activeNoticeType,
      activeFeatured,
      hasSearch,
      searchKey,
    },
    form: {
      qInput,
      setQInput,
      countryInput,
      setCountryInput,
      agencyInput,
      setAgencyInput,
      fromInput,
      setFromInput,
      toInput,
      setToInput,
      windowInput,
      setWindowInput,
      typeInput,
      setTypeInput,
    },
    result: {
      countries,
      agencies,
      items,
      total,
      serverPageSize,
      totalPages,
      loading,
      error,
      setError,
    },
    actions: {
      applySearch,
      clearSearch,
      toggleFeatured,
    },
  };
}
