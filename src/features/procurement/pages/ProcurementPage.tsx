import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Crown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { getOrderStatus } from "@/features/payment/api";
import { RecentUnlocks } from "@/features/payment/components/RecentUnlocks";
import type {
  UnspscOption,
  NoticeItem,
  MembershipPlan,
  MembershipStatus,
} from "../types";
import {
  fetchUnspscIndustries,
  fetchUnspscChildren,
  fetchNotices,
  fetchNoticeCountries,
  fetchMembershipPlans,
  fetchMembershipStatus,
  viewNotice,
  unlockNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchUnlockedNoticeIds,
  fetchIndustryPrefs,
  fetchRecommendedNotices,
  sendNoticeFeedback,
} from "../api";
import { NoticeCard } from "../components/NoticeCard";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { ProcurementPagination } from "../components/ProcurementPagination";
import { useNoticePayment } from "../hooks/useNoticePayment";

const PAGE_SIZE = 9;
// 免费详情查看配额的兜底值（membership 未加载时使用）；
// 真实配额以后端 membership.free_quota 为准（源自 crm_membership_plans 表）
const FREE_QUOTA_FALLBACK = 3;

// 进入公采页的初始化状态机（本地差异 #5）：
// loading = 登录态判定中；prefs = 按账号默认行业筛选；recommended = 按行为兴趣推荐；default = 现状全量
type PrefsMode = "loading" | "prefs" | "recommended" | "default";

export default function ProcurementPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const userKey = authUser?.user_key;

  const onRequireLogin = () => {
    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
  };
  const [levels, setLevels] = useState<Array<UnspscOption[]>>([[], [], [], [], []]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["", "", "", "", ""]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<MembershipPlan[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const noticesRequestSeq = useRef(0);

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
  const hasSearch = Boolean(
    activeQ || activeCountry || activeFrom || activeTo ||
    activeValueMin || activeValueMax || activeWindow || activeNoticeType
  );
  const searchKey = `${activeQ}|${activeCountry}|${activeFrom}|${activeTo}|${activeSort}|${activeValueMin}|${activeValueMax}|${activeWindow}|${activeNoticeType}`;

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
    const sortValue = sortOverride ?? activeSort;
    if (sortValue !== "deadline") next.sort = sortValue;
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

  // ── 账号默认行业偏好三级降级（本地差异 #5 配套前端）──
  // 未登录直接 default（行为零变化）；已登录先探测偏好 → 推荐 → 全量
  const [prefsMode, setPrefsMode] = useState<PrefsMode>(() => (authUser?.user_key ? "loading" : "default"));
  // 记录已探测过的账号：布尔锁会漏掉"登出→换号"场景，按 userKey 判重才能给新账号重新探测
  const prefsInitKeyRef = useRef<string | null>(null);
  // 偏好变更事件的重探测信号量：prefsMode 可能已是 loading（setState 同值不触发 effect），
  // 递增 tick 才能保证探测 effect 必定重跑，不会卡死在 loading
  const [prefsRefreshTick, setPrefsRefreshTick] = useState(0);

  useEffect(() => {
    if (!userKey) {
      // 登出：清掉上一账号的自动筛选残留（预选 + 提示条），回未登录全量现状
      prefsInitKeyRef.current = null;
      if (prefsMode !== "default") {
        setPrefsMode("default");
        setSelectedIds(["", "", "", "", ""]);
        setLevels((prev) => [prev[0], [], [], [], []]);
        setPage(1);
      }
      return;
    }
    if (prefsInitKeyRef.current === userKey) return;
    prefsInitKeyRef.current = userKey;
    // 过期判定用 ref 而非 cleanup 标志：StrictMode 双执行下 cleanup 会把首轮探测
    // 全部作废、次轮又被判重拦截，导致 prefsMode 永远卡在 loading（公告不加载）
    const stale = () => prefsInitKeyRef.current !== userKey;
    (async () => {
      const prefs = await fetchIndustryPrefs(userKey);
      if (stale()) return;
      if (prefs?.level1_id) {
        // S0 有账号偏好：预选级联路径，走现有 code_id 确定性筛选链路
        const path = [prefs.level1_id, prefs.level2_id, prefs.level3_id, prefs.level4_id, prefs.level5_id]
          .map((id) => (id ? String(id) : ""));
        const nextChildren: UnspscOption[][] = [[], [], [], []];
        for (let i = 0; i < 4 && path[i]; i += 1) {
          try {
            const children = await fetchUnspscChildren(path[i], locale);
            nextChildren[i] = Array.isArray(children) ? children : [];
          } catch {
            nextChildren[i] = [];
          }
        }
        if (stale()) return;
        setLevels((prev) => [prev[0], nextChildren[0], nextChildren[1], nextChildren[2], nextChildren[3]]);
        setSelectedIds(path);
        setPrefsMode("prefs");
        return;
      }
      // S1 无偏好：探测行为兴趣推荐，有结果则切推荐数据源
      try {
        const probe = await fetchRecommendedNotices({ userKey, page: 1, pageSize: PAGE_SIZE });
        if (stale()) return;
        if (Number(probe.total || 0) > 0) {
          setPrefsMode("recommended");
          return;
        }
      } catch {
        // 推荐接口异常同样回退全量
      }
      // S2 双空：现状全量列表
      if (!stale()) setPrefsMode("default");
    })();
    // prefsMode 入依赖仅服务登出清理分支；已登录路径有 prefsInitKeyRef 判重，不会重复探测；
    // prefsRefreshTick 由偏好变更事件递增，强制清锁后重新探测
  }, [userKey, prefsMode, prefsRefreshTick]);

  // 账号弹窗中保存/清除默认行业后广播 supply-os:industry-prefs-updated：
  // 同页打开弹窗时组件不卸载、userKey 不变，判重锁会拦住重新探测，
  // 故收到事件后清锁 + 清残留预选 + 回 loading + 递增 tick，让上方探测 effect 按新偏好重跑
  useEffect(() => {
    const onPrefsUpdated = () => {
      prefsInitKeyRef.current = null;
      setSelectedIds(["", "", "", "", ""]);
      setLevels((prev) => [prev[0], [], [], [], []]);
      setPage(1);
      setPrefsMode(userKey ? "loading" : "default");
      setPrefsRefreshTick((tick) => tick + 1);
    };
    window.addEventListener("supply-os:industry-prefs-updated", onPrefsUpdated);
    return () => window.removeEventListener("supply-os:industry-prefs-updated", onPrefsUpdated);
  }, [userKey]);

  // 提示条中展示的偏好类目名（一级/二级名按 locale 取词，多级用 / 连接）
  const prefsBannerName = useMemo(() => {
    const names: string[] = [];
    selectedIds.forEach((id, index) => {
      if (!id) return;
      const opt = levels[index]?.find((item) => String(item.id) === id);
      if (!opt) return;
      const title =
        locale === "zh"
          ? opt.title_zh || opt.title || opt.name
          : opt.title_i18n || opt.title_en || opt.title || opt.name || opt.title_zh;
      if (title) names.push(title);
    });
    return names.join(" / ");
  }, [levels, selectedIds, locale]);

  // 「查看全部」/手动改筛选：退出自动模式，回到现状全量列表
  const exitAutoMode = () => {
    setPrefsMode("default");
    setSelectedIds(["", "", "", "", ""]);
    setLevels((prev) => [prev[0], [], [], [], []]);
    setPage(1);
  };

  // 已解锁公告 id 集合 + 详情拓展加载态（闪烁修复）
  // detailLoadingId 记录"正在为哪条公告加载"：快速连续点击时 A 的 finally 不会误清 B 的加载态
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set());
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const markUnlocked = (id: number) =>
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const totalPages = Math.max(1, Math.ceil(total / serverPageSize));
  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  const freeRemaining = Number(membership?.free_remaining ?? FREE_QUOTA_FALLBACK);
  const freeQuota = Number(membership?.free_quota ?? FREE_QUOTA_FALLBACK);
  const canUsePaidQuota = isVip || paidRemaining > 0;

  const getDetailViewCountKey = () => `procurement_detail_views_${userKey || "guest"}`;
  const getDetailViewCount = () => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(getDetailViewCountKey()) || 0);
  };
  const setDetailViewCount = (count: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getDetailViewCountKey(), String(count));
  };

  const deepestCodeId = useMemo(() => {
    for (let i = selectedIds.length - 1; i >= 0; i -= 1) {
      if (selectedIds[i]) return selectedIds[i];
    }
    return "";
  }, [selectedIds]);

  const refreshMembership = async (useCache = false) => {
    if (!userKey) {
      setMembership(null);
      return;
    }
    try {
      const data = await fetchMembershipStatus(userKey, useCache);
      setMembership(data);
    } catch {
      setMembership(null);
    }
  };

  // 登录后预取已解锁集合：详情首帧据此决定骨架屏还是锁定面板
  useEffect(() => {
    if (!userKey) {
      setUnlockedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUnlockedNoticeIds(userKey).then((ids) => {
      if (!cancelled) setUnlockedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  // 拉取已解锁公告的拓展详情并合并进当前选中项
  const loadNoticeDetail = async (notice: NoticeItem) => {
    if (!userKey) {
      setDetailLoadingId(null);
      return;
    }
    try {
      const detail = await fetchNoticeDetail(notice.id, userKey);
      setSelectedNotice((prev) => (prev && prev.id === notice.id ? { ...prev, ...detail } : prev));
      markUnlocked(notice.id);
    } catch {
      // 未解锁或加载失败：保留列表数据，不阻断详情页
    } finally {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
    }
  };

  // 采购详情内嵌多套餐付费面板状态：付费墙 / 订单 / 轮询对账，对齐远端 PaymentPanel
  const {
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    setPaymentProvider,
    openPaywall,
    closePaywall,
    createNoticeOrder,
    markPaid,
  } = useNoticePayment({
    userKey,
    onRequireLogin,
    onPaid: async (noticeId, planCode) => {
      const unlockType = planCode.includes("single") ? "single" : "subscription";
      // 支付成功后详情拉取期间同样以骨架屏过渡
      setDetailLoadingId(noticeId);
      try {
        await unlockNotice(noticeId, userKey || "", unlockType, unlockType === "single" ? 89 : 0);
      } catch {
        // 支付回调可能已在服务端完成解锁，忽略此处失败
      }
      await refreshMembership();
      await loadNoticeDetail({ id: noticeId } as NoticeItem);
      setActionMessage(t("procurement_paidUnlockOk"));
    },
  });

  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then((data) => setLevels((prev) => [Array.isArray(data) ? data : [], prev[1], prev[2], prev[3], prev[4]]))
      .catch(() => setError("Failed to load UNSPSC categories."));

    fetchMembershipPlans()
      .then((plans) => setPaidPlans(Array.isArray(plans) ? plans : []))
      .catch(() => {});
  }, []);

  // 切语言后按当前选择路径重拉各级选项：fr/ru/es/ar 的选项译文由后端按 lang 返回，
  // 必须重新请求才能刷新文案。localeRef 守卫保证仅语言变化时触发（挂载与选级联不重拉）
  const localeRef = useRef(locale);
  useEffect(() => {
    if (localeRef.current === locale) return;
    localeRef.current = locale;
    (async () => {
      const nextLevels: UnspscOption[][] = [[], [], [], [], []];
      try {
        const industries = await fetchUnspscIndustries(locale);
        nextLevels[0] = Array.isArray(industries) ? industries : [];
      } catch {
        nextLevels[0] = [];
      }
      for (let i = 0; i < 4 && selectedIds[i]; i += 1) {
        try {
          const children = await fetchUnspscChildren(selectedIds[i], locale);
          nextLevels[i + 1] = Array.isArray(children) ? children : [];
        } catch {
          nextLevels[i + 1] = [];
        }
      }
      setLevels(nextLevels);
    })();
  }, [locale, selectedIds]);

  useEffect(() => {
    refreshMembership(true);
  }, [userKey, isVip]);

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
          })
        : prefsMode === "recommended" && userKey
          ? fetchRecommendedNotices({ userKey, page, pageSize: PAGE_SIZE, excludeDismissed: true })
          : fetchNotices({ page, pageSize: PAGE_SIZE, codeId: deepestCodeId || undefined });

    request
      .then((json) => {
        if (requestSeq !== noticesRequestSeq.current) return;
        const nextPageSize = Number(json.pageSize || json.page_size || PAGE_SIZE);
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

  // ── T-B9 推荐反馈采集（本地差异 #13：D.7 前端侧）──
  // 仅推荐模式采集曝光/点击/dismiss/收藏，避免污染搜索/筛选场景的反馈数据
  const feedbackEnabled = Boolean(userKey) && prefsMode === "recommended" && !hasSearch && activeSort === "deadline";
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  // 曝光去重：本地 Set 记录已上报卡片（同 session 同卡只报一次；服务端唯一键幂等兜底）
  const impressionReportedRef = useRef<Set<number>>(new Set());
  const impressionPendingRef = useRef<number[]>([]);
  const impressionTimerRef = useRef<number | null>(null);
  const cardElsRef = useRef<Map<number, Element>>(new Map());
  const observedIdsRef = useRef<Map<Element, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const userKeyRef = useRef(userKey);
  userKeyRef.current = userKey;

  // 待上报曝光短暂聚合后批量发送（≤50 条与服务端一致）
  const flushImpressions = () => {
    impressionTimerRef.current = null;
    const key = userKeyRef.current;
    const batch = impressionPendingRef.current.splice(0, 50);
    if (key && batch.length) {
      void sendNoticeFeedback(key, batch.map((id) => ({ notice_id: id, action: "impression" as const })));
    }
  };

  const getImpressionObserver = () => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = observedIdsRef.current.get(entry.target);
            if (!id || impressionReportedRef.current.has(id)) return;
            impressionReportedRef.current.add(id);
            impressionPendingRef.current.push(id);
            observerRef.current?.unobserve(entry.target);
          });
          if (impressionPendingRef.current.length && impressionTimerRef.current === null) {
            impressionTimerRef.current = window.setTimeout(flushImpressions, 500);
          }
        },
        { threshold: 0.5 }
      );
    }
    return observerRef.current;
  };

  // NoticeCard 根节点挂载/卸载回调：挂载即观察，卸载解除观察
  const observeCard = (el: HTMLElement | null, noticeId: number) => {
    const prev = cardElsRef.current.get(noticeId);
    if (prev && prev !== el) {
      observerRef.current?.unobserve(prev);
      observedIdsRef.current.delete(prev);
    }
    if (el) {
      cardElsRef.current.set(noticeId, el);
      observedIdsRef.current.set(el, noticeId);
      if (!impressionReportedRef.current.has(noticeId)) getImpressionObserver().observe(el);
    } else {
      cardElsRef.current.delete(noticeId);
    }
  };

  // 卸载清理：断开观察器、冲掉未上报的曝光批次
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      if (impressionTimerRef.current !== null) {
        window.clearTimeout(impressionTimerRef.current);
        flushImpressions();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // dismiss：本地立即移除 → 上报落库 → exclude_dismissed 补拉当页补足 pageSize（D.6 前端侧）
  const handleDismissNotice = async (notice: NoticeItem) => {
    if (!userKey) return;
    setItems((prev) => prev.filter((it) => it.id !== notice.id));
    await sendNoticeFeedback(userKey, [{ notice_id: notice.id, action: "dismiss" }]);
    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    try {
      const json = await fetchRecommendedNotices({ userKey, page, pageSize: PAGE_SIZE, excludeDismissed: true });
      if (requestSeq !== noticesRequestSeq.current) return;
      setItems(Array.isArray(json.items) ? json.items : []);
      setTotal(Number(json.total || 0));
    } catch {
      // 补拉失败保持本地移除结果，不阻断页面
    }
  };

  // 收藏：本地置亮 + 一次性上报（服务端幂等，重复点击不再发送）
  const handleFavoriteNotice = (notice: NoticeItem) => {
    if (!userKey || favoritedIds.has(notice.id)) return;
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      next.add(notice.id);
      return next;
    });
    void sendNoticeFeedback(userKey, [{ notice_id: notice.id, action: "favorite" }]);
  };

  const handleLevelChange = async (levelIndex: number, value: string) => {
    // 用户手动操作任一级筛选：立即退出 prefs/recommended 自动模式（提示条消失，会话内按手动为准）
    if (prefsMode !== "default") setPrefsMode("default");
    const nextSelected = selectedIds.map((id, index) => (index < levelIndex ? id : ""));
    nextSelected[levelIndex] = value;
    setSelectedIds(nextSelected);
    setPage(1);
    setSelectedNotice(null);

    const nextLevels = levels.map((list, index) => (index <= levelIndex ? list : []));
    if (value && levelIndex < 4) {
      try {
        const children = await fetchUnspscChildren(value, locale);
        nextLevels[levelIndex + 1] = Array.isArray(children) ? children : [];
      } catch {
        nextLevels[levelIndex + 1] = [];
      }
    }
    setLevels(nextLevels);
  };

  const openNotice = async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
    if (feedbackEnabled) void sendNoticeFeedback(userKey, [{ notice_id: notice.id, action: "click" }]);

    const currentViews = getDetailViewCount();
    const alreadyUnlocked = unlockedIds.has(notice.id);
    // 门槛与后端配额同源：freeQuota 来自 membership.free_quota（DB 单一数据源）
    if (!isVip && !alreadyUnlocked && currentViews >= freeQuota) {
      setSelectedNotice(notice);
      setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
      openPaywall(notice);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 三请求并行：浏览计数与配额刷新不再阻塞详情数据到达
    void viewNotice(notice.id, userKey);
    if (!isVip && !alreadyUnlocked) setDetailViewCount(currentViews + 1);
    setDetailLoadingId(alreadyUnlocked ? notice.id : null);
    setSelectedNotice(notice);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    void refreshMembership();
    void loadNoticeDetail(notice);
  };

  // 按 id 打开公告详情（列表内已有则复用，否则以最小对象占位再合并拓展详情）
  const openNoticeById = async (id: number) => {
    const base = items.find((it) => it.id === id) || ({ id } as NoticeItem);
    setDetailLoadingId(id);
    setSelectedNotice(base);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadNoticeDetail(base);
  };

  // 单条公告付费买断：派发真实支付事件（携带 notice_id + 回跳地址）
  const handlePayUnlock = (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }
    window.dispatchEvent(new CustomEvent("supply-os:pay", {
      detail: {
        code: "single_89",
        name: t("procurement_singleUnlockName"),
        price: 89,
        currency: "CNY",
        noticeId: notice.id,
        returnUrl: `${window.location.origin}/procurement`,
      },
    }));
  };

  // 支付整页跳回后的对账：?order_no=&trade_no=&notice_id= 或仅 ?notice_id=
  useEffect(() => {
    const orderNo = searchParams.get("order_no");
    const noticeIdParam = searchParams.get("notice_id");
    const tradeNo = searchParams.get("trade_no") || undefined;
    if (!orderNo && !noticeIdParam) return;
    let cancelled = false;
    (async () => {
      if (orderNo) {
        try {
          const status = await getOrderStatus(orderNo, tradeNo);
          if (cancelled) return;
          if (status.status === "paid") {
            setActionMessage(t("procurement_paymentReturnPaid"));
            await refreshMembership();
            const nid = status.notice_id ?? (noticeIdParam ? Number(noticeIdParam) : null);
            if (nid) await openNoticeById(nid);
          } else {
            setActionMessage(t("procurement_paymentReturnPending"));
          }
        } catch {
          if (!cancelled) setActionMessage(t("procurement_paymentReturnFailed"));
        }
      } else if (noticeIdParam) {
        await openNoticeById(Number(noticeIdParam));
      }
      if (!cancelled) setSearchParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 同页支付成功（mock/弹窗轮询）：刷新配额并展开已解锁详情
  useEffect(() => {
    const onNoticePaid = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.noticeId) {
        void refreshMembership().then(() => openNoticeById(Number(detail.noticeId)));
      }
    };
    window.addEventListener("supply-os:notice-paid", onNoticePaid);
    return () => window.removeEventListener("supply-os:notice-paid", onNoticePaid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, userKey]);

  const handleUnlockNotice = async (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => {
    if (!userKey) {
      onRequireLogin();
      return false;
    }

    if (!unlockType && !canUsePaidQuota && freeRemaining <= 0) {
      setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
      openPaywall(notice);
      return false;
    }

    const nextUnlockType = unlockType || (canUsePaidQuota ? "subscription" : "free");
    // 解锁发起即进入加载态：锁定面板让位于骨架屏，直至详情返回
    setDetailLoadingId(notice.id);
    let res: Awaited<ReturnType<typeof unlockNotice>>;
    try {
      res = await unlockNotice(notice.id, userKey, nextUnlockType, nextUnlockType === "single" ? 89 : 0);
    } catch {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
      setActionMessage(t("procurement_unlockFail"));
      return false;
    }

    if (!res.ok) {
      // 解锁失败：复位加载态，恢复锁定面板
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
      if (res.status === 402) {
        setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
        openPaywall(notice);
      } else {
        setActionMessage(t("procurement_unlockFail"));
      }
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    markUnlocked(notice.id);
    setActionMessage(nextUnlockType === "free" ? t("procurement_freeUnlockOk") : t("procurement_paidUnlockOk"));
    // 解锁成功后拉取拓展详情，实时补全联系人/文件等信息
    await loadNoticeDetail(notice);
    return true;
  };

  const handleExpressInterest = async (notice: NoticeItem, interestType: "interested" | "subscribed") => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    const res = await expressInterest(notice.id, userKey, interestType);

    if (!res.ok) {
      setActionMessage("Action failed. Please try again later.");
      return;
    }

    setActionMessage(interestType === "subscribed" ? t("procurement_subscribedSuccess") : t("procurement_actionSuccess"));
    await refreshMembership();
    openPaywall(notice);
  };

  // 列表数据即服务端命中结果（本地差异 #6：客户端"当页九条内过滤"已由服务端全库搜索取代）

  // 详情页
  if (selectedNotice) {
    return (
      <NoticeDetail
        notice={selectedNotice}
        actionMessage={actionMessage}
        membership={membership}
        freeRemaining={freeRemaining}
        freeQuota={freeQuota}
        canUsePaidQuota={canUsePaidQuota}
        isVip={isVip}
        detailLoading={detailLoadingId === selectedNotice.id}
        onBack={() => {
          closePaywall();
          setDetailLoadingId(null);
          setSelectedNotice(null);
        }}
        onExpressInterest={handleExpressInterest}
        onUnlock={(n) => handleUnlockNotice(n)}
        onPayUnlock={handlePayUnlock}
        payment={{
          plans: paidPlans,
          paywallNotice,
          order: paymentOrder,
          provider: paymentProvider,
          busyPlanCode,
          message: paymentMessage,
          onProviderChange: setPaymentProvider,
          onCreateOrder: createNoticeOrder,
          onMockPaid: markPaid,
          onClose: closePaywall,
        }}
      />
    );
  }

  // 列表页
  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              {t("procurement_poolTitle")}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{t("procurement_poolDesc", { count: freeQuota })}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {t("procurement_total")} {total} {t("procurement_items")}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold">
              {canUsePaidQuota
                ? t("procurement_vipActive")
                : `${t("procurement_freeTrial")} ${freeRemaining} ${t("procurement_items")}`}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <UnspcsSelector levels={levels} selectedIds={selectedIds} onChange={handleLevelChange} />
          {/* 公采搜索栏（本地差异 #6：G.3 + #13：T-B9 多维过滤）——服务端全库搜索 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_150px_150px_170px_auto] gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder={t("procurement_searchPlaceholder")}
                dir="auto"
                className="w-full ps-9 pe-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <select
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value)}
              aria-label={t("procurement_countryAll")}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">{t("procurement_countryAll")}</option>
              {countries.map((item) => (
                <option key={item.country} value={item.country}>
                  {item.country} ({item.count})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              title={t("procurement_deadlineFrom")}
              aria-label={t("procurement_deadlineFrom")}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              title={t("procurement_deadlineTo")}
              aria-label={t("procurement_deadlineTo")}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <select
              value={activeSort}
              onChange={(e) => applySearch(e.target.value === "latest" ? "latest" : "deadline")}
              aria-label={t("procurement_sortByDeadline")}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="deadline">{t("procurement_sortByDeadline")}</option>
              <option value="latest">{t("procurement_sortByLatest")}</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-black hover:bg-teal-700 whitespace-nowrap"
              >
                {t("procurement_searchBtn")}
              </button>
              {hasSearch && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 whitespace-nowrap"
                >
                  {t("procurement_clearSearch")}
                </button>
              )}
            </div>
            </div>
            {/* T-B9 第二行：截止窗口 / 金额区间（USD）/ 采购类型（对接 T-B8 服务端过滤） */}
            <div className="grid grid-cols-2 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)] gap-3">
              <select
                value={windowInput}
                onChange={(e) => setWindowInput(e.target.value)}
                aria-label={t("procurement_deadlineWindowAny")}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">{t("procurement_deadlineWindowAny")}</option>
                <option value="7">{t("procurement_deadlineWindow7")}</option>
                <option value="30">{t("procurement_deadlineWindow30")}</option>
                <option value="90">{t("procurement_deadlineWindow90")}</option>
              </select>
              <input
                type="number"
                min={0}
                dir="ltr"
                value={valueMinInput}
                onChange={(e) => setValueMinInput(e.target.value)}
                placeholder={t("procurement_valueMinPlaceholder")}
                aria-label={t("procurement_valueMinPlaceholder")}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <input
                type="number"
                min={0}
                dir="ltr"
                value={valueMaxInput}
                onChange={(e) => setValueMaxInput(e.target.value)}
                placeholder={t("procurement_valueMaxPlaceholder")}
                aria-label={t("procurement_valueMaxPlaceholder")}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <input
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value)}
                placeholder={t("procurement_noticeTypePlaceholder")}
                aria-label={t("procurement_noticeTypePlaceholder")}
                dir="auto"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </form>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-teal-600" />
            {t("procurement_currentPage")} {page} / {totalPages} {t("procurement_page")},{" "}
            {t("procurement_eachPage")} {serverPageSize} {t("procurement_items")}
          </span>
          {loading && <span className="font-bold text-teal-600">{t("procurement_loading")}</span>}
        </div>

        {/* 自动筛选提示条：偏好/推荐模式可一键退出回全量（本地差异 #5） */}
        {(prefsMode === "prefs" || prefsMode === "recommended") && (
          <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700">
            <span>
              {prefsMode === "prefs"
                ? t("procurement_prefsBanner", { name: prefsBannerName })
                : t("procurement_recommendedBanner")}
            </span>
            <button
              type="button"
              onClick={exitAutoMode}
              className="shrink-0 font-black underline hover:text-teal-900"
            >
              {t("procurement_viewAll")}
            </button>
          </div>
        )}

        {userKey && <RecentUnlocks userKey={userKey} onOpenNotice={openNoticeById} />}

        {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <NoticeCard
              key={item.id}
              item={item}
              onClick={openNotice}
              // T-B9：仅推荐模式启用反馈交互与曝光采集（避免污染搜索/筛选场景数据）
              onDismiss={feedbackEnabled ? handleDismissNotice : undefined}
              onFavorite={feedbackEnabled ? handleFavoriteNotice : undefined}
              favorited={favoritedIds.has(item.id)}
              observe={feedbackEnabled ? observeCard : undefined}
            />
          ))}
        </div>

        {!loading && items.length === 0 && (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            {t("procurement_noMatch")}
          </div>
        )}

        <ProcurementPagination
          page={page}
          totalPages={totalPages}
          serverPageSize={serverPageSize}
          total={total}
          loading={loading}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
