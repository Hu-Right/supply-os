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
  fetchMembershipPlans,
  fetchMembershipStatus,
  viewNotice,
  unlockNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchUnlockedNoticeIds,
} from "../api";
import { NoticeCard } from "../components/NoticeCard";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { ProcurementPagination } from "../components/ProcurementPagination";
import { useNoticePayment } from "../hooks/useNoticePayment";

const PAGE_SIZE = 9;
const FREE_DETAIL_VIEW_LIMIT = 3;

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
  const [query, setQuery] = useState("");
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<MembershipPlan[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const noticesRequestSeq = useRef(0);

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
  const freeRemaining = Number(membership?.free_remaining ?? 2);
  const freeQuota = Number(membership?.free_quota ?? 2);
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
    fetchUnspscIndustries()
      .then((data) => setLevels((prev) => [Array.isArray(data) ? data : [], prev[1], prev[2], prev[3], prev[4]]))
      .catch(() => setError("Failed to load UNSPSC categories."));

    fetchMembershipPlans()
      .then((plans) => setPaidPlans(Array.isArray(plans) ? plans : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMembership(true);
  }, [userKey, isVip]);

  useEffect(() => {
    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");

    fetchNotices({ page, pageSize: PAGE_SIZE, codeId: deepestCodeId || undefined })
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
  }, [deepestCodeId, page]);

  const handleLevelChange = async (levelIndex: number, value: string) => {
    const nextSelected = selectedIds.map((id, index) => (index < levelIndex ? id : ""));
    nextSelected[levelIndex] = value;
    setSelectedIds(nextSelected);
    setPage(1);
    setSelectedNotice(null);

    const nextLevels = levels.map((list, index) => (index <= levelIndex ? list : []));
    if (value && levelIndex < 4) {
      try {
        const children = await fetchUnspscChildren(value);
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

    const currentViews = getDetailViewCount();
    const alreadyUnlocked = unlockedIds.has(notice.id);
    if (!isVip && !alreadyUnlocked && currentViews >= FREE_DETAIL_VIEW_LIMIT) {
      setSelectedNotice(notice);
      setActionMessage(t("procurement_freeLimit"));
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
      setActionMessage(t("procurement_freeLimit"));
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
        setActionMessage(t("procurement_freeLimit"));
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

  const visibleItems = items.filter((item) => {
    if (!query.trim()) return true;
    const haystack = `${item.title} ${item.agency || ""} ${item.country || ""} ${item.reference || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

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
            <p className="text-xs text-slate-500 mt-1">{t("procurement_poolDesc")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {t("procurement_total")} {total} {t("procurement_items")}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold">
              {canUsePaidQuota
                ? t("procurement_vipActive")
                : `${t("procurement_freeTrial")} ${membership?.free_remaining ?? 2} ${t("procurement_items")}`}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3">
            <UnspcsSelector levels={levels} selectedIds={selectedIds} onChange={handleLevelChange} />
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("procurement_search")}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
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

        {userKey && <RecentUnlocks userKey={userKey} onOpenNotice={openNoticeById} />}

        {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <NoticeCard key={item.id} item={item} onClick={openNotice} />
          ))}
        </div>

        {!loading && visibleItems.length === 0 && (
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
