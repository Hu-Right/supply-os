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
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NoticeItem, PrefsMode } from "../types";
import { fetchNotices, fetchNoticeCountries, fetchRecommendedNotices } from "../api";

export const PAGE_SIZE = 9;

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
}

export interface UseNoticeSearchReturn {
  /** URL 生效条件（唯一事实源） */
  query: {
    activeQ: string;
    activeCountry: string;
    activeFrom: string;
    activeTo: string;
    activeSort: "deadline" | "latest";
    activeValueMin: string;
    activeValueMax: string;
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
    fromInput: string;
    setFromInput: (value: string) => void;
    toInput: string;
    setToInput: (value: string) => void;
    valueMinInput: string;
    setValueMinInput: (value: string) => void;
    valueMaxInput: string;
    setValueMaxInput: (value: string) => void;
    windowInput: string;
    setWindowInput: (value: string) => void;
    typeInput: string;
    setTypeInput: (value: string) => void;
  };
  /** 列表数据 */
  result: {
    countries: Array<{ country: string; count: number }>;
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
    applySearch: (sortOverride?: "deadline" | "latest") => void;
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
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  // ── 公采搜索栏（本地差异 #6：G.3 服务端搜索，URL 参数为唯一事实源）──
  // 生效条件从 URL 读取（卡片旁可直接附结果页链接直达）；表单输入为待提交草稿
  const activeQ = searchParams.get("q") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeFrom = searchParams.get("deadline_from") || "";
  const activeTo = searchParams.get("deadline_to") || "";
  const activeSort: "deadline" | "latest" = searchParams.get("sort") === "latest" ? "latest" : "deadline";
  // T-B9（本地差异 #13）：多维过滤参数同样以 URL 为唯一事实源（对接 T-B8 服务端参数）
  const activeValueMin = searchParams.get("value_min") || "";
  const activeValueMax = searchParams.get("value_max") || "";
  const activeWindow = searchParams.get("deadline_within_days") || "";
  const activeNoticeType = searchParams.get("notice_type") || "";
  // T-A4（本地差异 #14）：只看精选开关，URL 为唯一事实源（刷新/直达链接均保持）
  // [精选功能重新启用 2026-07-31] 恢复 URL featured 参数解析（删除禁用期 stub）
  const activeFeatured = searchParams.get("featured") === "1";
  const hasSearch = Boolean(
    activeQ || activeCountry || activeFrom || activeTo ||
    activeValueMin || activeValueMax || activeWindow || activeNoticeType || activeFeatured
  );
  const searchKey = `${activeQ}|${activeCountry}|${activeFrom}|${activeTo}|${activeSort}|${activeValueMin}|${activeValueMax}|${activeWindow}|${activeNoticeType}|${activeFeatured ? "1" : ""}`;

  const [qInput, setQInput] = useState(activeQ);
  const [countryInput, setCountryInput] = useState(activeCountry);
  const [fromInput, setFromInput] = useState(activeFrom);
  const [toInput, setToInput] = useState(activeTo);
  const [valueMinInput, setValueMinInput] = useState(activeValueMin);
  const [valueMaxInput, setValueMaxInput] = useState(activeValueMax);
  const [windowInput, setWindowInput] = useState(activeWindow);
  const [typeInput, setTypeInput] = useState(activeNoticeType);
  const [countries, setCountries] = useState<Array<{ country: string; count: number }>>([]);

  // URL 外部变化（支付回跳清参等）时同步表单草稿，避免输入框残留失效条件
  useEffect(() => {
    setQInput(activeQ);
    setCountryInput(activeCountry);
    setFromInput(activeFrom);
    setToInput(activeTo);
    setValueMinInput(activeValueMin);
    setValueMaxInput(activeValueMax);
    setWindowInput(activeWindow);
    setTypeInput(activeNoticeType);
  }, [activeQ, activeCountry, activeFrom, activeTo, activeValueMin, activeValueMax, activeWindow, activeNoticeType]);

  // 国家下拉数据源（服务端缓存 10 分钟，前端按 URL 会话级缓存）
  useEffect(() => {
    fetchNoticeCountries()
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .catch(() => setCountries([]));
  }, []);

  // 提交搜索：写 URL 参数并重置分页；手动搜索即退出 prefs/recommended 自动模式
  const applySearch = (sortOverride?: "deadline" | "latest") => {
    const next: Record<string, string> = {};
    if (qInput.trim()) next.q = qInput.trim();
    if (countryInput) next.country = countryInput;
    if (fromInput) next.deadline_from = fromInput;
    if (toInput) next.deadline_to = toInput;
    // T-B9：金额区间/截止窗口/采购类型（对接 T-B8 服务端过滤）
    if (valueMinInput && Number(valueMinInput) > 0) next.value_min = valueMinInput;
    if (valueMaxInput && Number(valueMaxInput) > 0) next.value_max = valueMaxInput;
    if (windowInput) next.deadline_within_days = windowInput;
    if (typeInput.trim()) next.notice_type = typeInput.trim();
    // T-A4：手动搜索不重置精选开关（开关独立于表单草稿，状态延续）
    if (activeFeatured) next.featured = "1";
    const sortValue = sortOverride ?? activeSort;
    if (sortValue !== "deadline") next.sort = sortValue;
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
    setQInput("");
    setCountryInput("");
    setFromInput("");
    setToInput("");
    setValueMinInput("");
    setValueMaxInput("");
    setWindowInput("");
    setTypeInput("");
    setPage(1);
    setSearchParams({});
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
    if (prefsMode === "loading" && !hasSearch) return;
    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");

    // 数据源三选一：搜索条件优先（服务端三级匹配）> 推荐模式 > 现有 code_id 筛选链路
    const request =
      hasSearch || activeSort !== "deadline"
        ? fetchNotices({
            page,
            pageSize: PAGE_SIZE,
            codeId: deepestCodeId || undefined,
            q: activeQ || undefined,
            country: activeCountry || undefined,
            deadlineFrom: activeFrom || undefined,
            deadlineTo: activeTo || undefined,
            sort: activeSort,
            userKey: userKey || undefined,
            valueMin: activeValueMin ? Number(activeValueMin) : undefined,
            valueMax: activeValueMax ? Number(activeValueMax) : undefined,
            deadlineWithinDays: activeWindow ? Number(activeWindow) : undefined,
            noticeType: activeNoticeType || undefined,
            featured: activeFeatured || undefined, // [精选功能重新启用 2026-07-31]
          })
        : prefsMode === "recommended" && userKey
          ? fetchRecommendedNotices({ userKey, page, pageSize: PAGE_SIZE })
          : fetchNotices({ page, pageSize: PAGE_SIZE, codeId: deepestCodeId || undefined });

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
  }, [deepestCodeId, page, prefsMode, searchKey]);

  return {
    query: {
      activeQ,
      activeCountry,
      activeFrom,
      activeTo,
      activeSort,
      activeValueMin,
      activeValueMax,
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
      fromInput,
      setFromInput,
      toInput,
      setToInput,
      valueMinInput,
      setValueMinInput,
      valueMaxInput,
      setValueMaxInput,
      windowInput,
      setWindowInput,
      typeInput,
      setTypeInput,
    },
    result: {
      countries,
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
