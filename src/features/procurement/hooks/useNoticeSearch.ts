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
import { fetchNotices, fetchNoticeCountries, fetchNoticeAgencies, fetchRecommendedNotices } from "../api";

export const PAGE_SIZE = 9;

// ── 表单草稿 reducer（7 个字段集中管理，消除 useState 碎片化）──
interface SearchFormState {
  q: string;
  country: string;
  agency: string;
  from: string;
  to: string;
  window: string;
  type: string;
}

type SearchFormAction =
  | { type: "set_q" | "set_country" | "set_agency" | "set_from" | "set_to" | "set_window" | "set_type"; payload: string }
  | { type: "sync"; payload: SearchFormState }
  | { type: "clear" };

function searchFormReducer(state: SearchFormState, action: SearchFormAction): SearchFormState {
  switch (action.type) {
    case "set_q": return { ...state, q: action.payload };
    case "set_country": return { ...state, country: action.payload };
    case "set_agency": return { ...state, agency: action.payload };
    case "set_from": return { ...state, from: action.payload };
    case "set_to": return { ...state, to: action.payload };
    case "set_window": return { ...state, window: action.payload };
    case "set_type": return { ...state, type: action.payload };
    case "sync": return { ...action.payload };
    case "clear": return { q: "", country: "", agency: "", from: "", to: "", window: "", type: "" };
    default: return state;
  }
}

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
  const { locale } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── 表单草稿状态（useReducer 集中管理 7 个字段）──
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
  // ── 公采搜索栏（本地差异 #6：G.3 服务端搜索，URL 参数为唯一事实源）──
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
  const hasSearch = Boolean(
    activeQ || activeCountry || activeAgency || activeFrom || activeTo ||
    activeWindow || activeNoticeType || activeFeatured
  );
  // BUG6 修复：searchKey 纳入 deepestCodeId，行业筛选变化时触发分页重置与数据重载
  const searchKey = `${activeQ}|${activeCountry}|${activeAgency}|${activeFrom}|${activeTo}|${activeSort}|${activeWindow}|${activeNoticeType}|${activeFeatured ? "1" : ""}|${deepestCodeId}`;

  const [countries, setCountries] = useState<Array<{ country: string; count: number }>>([]);
  const [agencies, setAgencies] = useState<Array<{ agency: string; count: number }>>([]);

  // URL 外部变化（支付回跳清参等）时同步表单草稿
  useEffect(() => {
    dispatchForm({
      type: "sync",
      payload: { q: activeQ, country: activeCountry, agency: activeAgency, from: activeFrom, to: activeTo,
        window: activeWindow, type: activeNoticeType },
    });
  }, [activeQ, activeCountry, activeAgency, activeFrom, activeTo, activeWindow, activeNoticeType]);

  // BUG-1 修复：搜索条件变化时主动清除前端 apiCached 缓存，
  // 避免 30s TTL 内来回切换筛选器时命中过期缓存返回错误数据
  const prevSearchKeyForCacheRef = useRef(searchKey);
  useEffect(() => {
    if (prevSearchKeyForCacheRef.current !== searchKey) {
      prevSearchKeyForCacheRef.current = searchKey;
      // 清除搜索结果缓存（翻页不触发，因 page 不在 searchKey 中）
      clearApiCache("/api/notices?");
    }
  }, [searchKey]);

  // 生效条件变化时重置分页：applySearch/toggleFeatured 之外的外部 URL 变化
  // （支付回跳清参、前进/后退到搜索直达链接）不经过动作函数，旧页码会请求到
  // 空页误显"无匹配结果"。applySearch 路径重复置 1 为幂等无副作用。
  const prevSearchKeyRef = useRef(searchKey);
  useEffect(() => {
    if (prevSearchKeyRef.current === searchKey) return;
    prevSearchKeyRef.current = searchKey;
    setPage(1);
  }, [searchKey, setPage]);

  // 国家下拉数据源（服务端缓存 10 分钟，前端按 URL 会话级缓存）
  useEffect(() => {
    fetchNoticeCountries()
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .catch(() => setCountries([]));
  }, []);

  // 采购机构下拉数据源（服务端缓存 10 分钟，前端按 URL 会话级缓存）
  useEffect(() => {
    fetchNoticeAgencies(locale)
      .then((data) => setAgencies(Array.isArray(data) ? data : []))
      .catch(() => setAgencies([]));
  }, [locale]);

  // 提交搜索：写 URL 参数并重置分页；手动搜索即退出 prefs/recommended 自动模式
  const applySearch = (sortOverride?: "deadline" | "latest" | "deadline_farthest") => {
    const next: Record<string, string> = {};
    if (qInput.trim()) next.q = qInput.trim();
    if (countryInput) next.country = countryInput;
    if (agencyInput) next.agency = agencyInput;
    if (fromInput) next.deadline_from = fromInput;
    if (toInput) next.deadline_to = toInput;
    // T-B9：截止窗口/采购类型（对接 T-B8 服务端过滤）
    if (windowInput) next.deadline_within_days = windowInput;
    if (typeInput.trim()) next.notice_type = typeInput.trim();
    // T-A4：手动搜索不重置精选开关（开关独立于表单草稿，状态延续）
    if (activeFeatured) next.featured = "1";
    // BUG5/7 修复：UNSPSC 行业筛选持久化到 URL，刷新页面后不丢失
    if (deepestCodeId) next.code_id = deepestCodeId;
    const sortValue = sortOverride ?? activeSort;
    if (sortValue !== "deadline_farthest") next.sort = sortValue;
    if (prefsMode !== "default") setPrefsMode("default");
    setPage(1);
    setSelectedNotice(null);
    setSearchParams(next);
  };

  // T-A4（本地差异 #14）：只看精选开关——立即生效写 URL，保留其余全部现有条件
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
  };

  // ── 列表数据与加载编排 ──
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const noticesRequestSeq = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / serverPageSize));

  useEffect(() => {
    // 初始化判定中不发全量请求，避免「全量→偏好」双闪；判定完成后本 effect 重新触发。
    // 带搜索条件（URL 直达链接）时不等判定：搜索数据源与偏好/推荐无关（本地差异 #6）
    // 登录/注册后 userKey 变化必须重跑：数据源可能从全量切到偏好/推荐，
    // userKey 未入 deps 时 prefsMode 保持 "default" 不变化会导致 effect 完全不重跑（登录后卡片消失 BUG）
    if (prefsMode === "loading" && !hasSearch && userKey) return;
    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");

    // 数据源三选一：搜索条件优先（服务端三级匹配）> 推荐模式 > 现有 code_id 筛选链路
    const request =
      hasSearch || activeSort !== "deadline_farthest"
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
            featured: activeFeatured || undefined, // [精选功能重新启用 2026-07-31]
            locale,
          })
        : prefsMode === "recommended" && userKey
          ? fetchRecommendedNotices({ userKey, page, pageSize: PAGE_SIZE, locale })
          : fetchNotices({ page, pageSize: PAGE_SIZE, codeId: deepestCodeId || undefined, locale });

    request
      .then((json) => {
        if (requestSeq !== noticesRequestSeq.current) return;
        const nextPageSize = Number(json.pageSize || json.page_size || PAGE_SIZE);
        variantRef.current = typeof json.variant === "string" ? json.variant : undefined; // T-B10
        setItems(Array.isArray(json.items) ? json.items : []);
        setTotal(Number(json.total || 0));
        setServerPageSize(nextPageSize);
      })
      .catch(() => {
        if (requestSeq === noticesRequestSeq.current) setError("Failed to load procurement notices.");
      })
      .finally(() => {
        if (requestSeq === noticesRequestSeq.current) setLoading(false);
      });
    // searchKey 覆盖 q/country/日期区间/排序/多维过滤等 URL 参数（本地差异 #6 + #13）
    // locale 纳入依赖：用户切换语言时需重新请求以获取对应译文
    // userKey 纳入依赖：登录/注册后数据源需按身份重新获取（偏好/推荐/行为落库）
    // BUG-5 修复：hasSearch 纳入依赖，确保数据源分支变更时 effect 正确重跑
  }, [deepestCodeId, page, prefsMode, searchKey, locale, userKey, hasSearch]);

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
