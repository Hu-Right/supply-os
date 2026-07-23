import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
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
} from "../api";
import { NoticeCard } from "../components/NoticeCard";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { ProcurementPagination } from "../components/ProcurementPagination";

const PAGE_SIZE = 9;
const FREE_DETAIL_VIEW_LIMIT = 3;

const ANNUAL_SERVICE_PLAN: MembershipPlan = {
  plan_code: "annual_manual_8800",
  name: "Annual advisory service",
  description:
    "Includes lead contact guidance, bid opportunity analysis, contract process, corporate transfer confirmation and WeChat service group.",
  price: 8800,
  currency: "CNY",
  duration_days: 365,
  unlock_quota: 0,
  free_quota: 0,
  plan_type: "manual",
};

export default function ProcurementPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const navigate = useNavigate();
  const userKey = authUser?.user_key;

  const onRequireLogin = () => {
    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
  };

  const handleBuyPlan = () => {
    if (!authUser) {
      onRequireLogin();
      return;
    }
    window.dispatchEvent(new CustomEvent("supply-os:pay", {
      detail: { code: ANNUAL_SERVICE_PLAN.plan_code, name: ANNUAL_SERVICE_PLAN.name, price: ANNUAL_SERVICE_PLAN.price, currency: ANNUAL_SERVICE_PLAN.currency }
    }));
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
  const [actionMessage, setActionMessage] = useState("");
  const noticesRequestSeq = useRef(0);

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

  useEffect(() => {
    fetchUnspscIndustries()
      .then((data) => setLevels((prev) => [Array.isArray(data) ? data : [], prev[1], prev[2], prev[3], prev[4]]))
      .catch(() => setError("Failed to load UNSPSC categories."));

    fetchMembershipPlans()
      .then(() => {})
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
    if (!isVip && currentViews >= FREE_DETAIL_VIEW_LIMIT) {
      setActionMessage(t("procurement_freeLimit"));
      return;
    }

    await viewNotice(notice.id, userKey);

    if (!isVip) setDetailViewCount(currentViews + 1);
    setSelectedNotice(notice);
    setActionMessage("");
    await refreshMembership();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUnlockNotice = async (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => {
    if (!userKey) {
      onRequireLogin();
      return false;
    }

    if (!unlockType && !canUsePaidQuota && freeRemaining <= 0) {
      setActionMessage(t("procurement_freeLimit"));
      return false;
    }

    const nextUnlockType = unlockType || (canUsePaidQuota ? "subscription" : "free");
    const res = await unlockNotice(notice.id, userKey, nextUnlockType, nextUnlockType === "single" ? 89 : 0);

    if (!res.ok) {
      setActionMessage(t("procurement_unlockFail"));
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    setActionMessage(nextUnlockType === "free" ? t("procurement_freeUnlockOk") : t("procurement_paidUnlockOk"));
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
        onBack={() => setSelectedNotice(null)}
        onExpressInterest={handleExpressInterest}
        onUnlock={(n) => handleUnlockNotice(n)}
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
            {!isVip && (
              <button onClick={handleBuyPlan} className="px-3 py-1.5 rounded-full bg-teal-600 text-white font-bold hover:bg-teal-500 cursor-pointer">
                {t("procurement_upgradeVip")}
              </button>
            )}
            <button onClick={() => navigate("/training")} className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 cursor-pointer">
              {t("procurementTrainingBtn")}
            </button>
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
