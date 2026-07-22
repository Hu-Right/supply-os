import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  ExternalLink,
  Heart,
  Lock,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
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

const getOptionLabel = (item: UnspscOption, locale: "zh" | "en") => {
  const title =
    locale === "zh"
      ? item.title_zh || item.title || item.name
      : item.title_en || item.title || item.name || item.title_zh;
  return `${item.code || ""}${item.code ? " - " : ""}${title || "Unnamed category"}`;
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
      .then((data) => {
        // Plans loaded but not used directly in this simplified version
      })
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
      <div className="space-y-5">
        <button
          onClick={() => setSelectedNotice(null)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("procurement_back")}
        </button>

        <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-[900px]:grid-cols-1">
            <main className="min-w-0 space-y-5">
              <div className="border-b border-slate-100 pb-5">
                <p className="text-xs font-black text-teal-600 uppercase tracking-wider">
                  {selectedNotice.notice_type || "Procurement Notice"}
                </p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-slate-950 mt-2 leading-tight">
                  {selectedNotice.title}
                </h3>
                <p className="text-sm text-slate-500 mt-3">
                  {selectedNotice.agency || selectedNotice.organization || t("procurement_unknownAgency")} ·{" "}
                  {selectedNotice.country || t("procurement_global")} ·{" "}
                  {selectedNotice.deadline || t("procurement_noDeadline")}
                </p>
              </div>

              {actionMessage && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                  {actionMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {[
                  [t("procurement_metaNo"), selectedNotice.reference || selectedNotice.notice_id || "-"],
                  [t("procurement_agency"), selectedNotice.agency || selectedNotice.organization || "-"],
                  [t("procurement_country"), selectedNotice.country || "-"],
                  [t("procurement_budget"), selectedNotice.estimated_value || t("procurement_budgetPending")],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="font-black text-slate-400 uppercase">{label}</p>
                    <p className="font-bold text-slate-800 mt-1 break-words">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900 mb-2">{t("procurement_description")}</h4>
                <p className="text-sm text-slate-600 leading-7 whitespace-pre-line break-words">
                  {selectedNotice.description || t("procurement_noDesc")}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900 mb-2">{t("procurement_tags")}</h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedNotice.unspsc_codes || []).slice(0, 16).map((code, index) => (
                    <span
                      key={`${code.code || index}`}
                      className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600"
                    >
                      {code.code || code.name || code.description}
                    </span>
                  ))}
                </div>
              </div>

              {selectedNotice.source_url && (
                <a
                  href={selectedNotice.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
                >
                  {t("procurement_source")}
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </main>

            <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <button
                  onClick={() => handleExpressInterest(selectedNotice, "interested")}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
                >
                  <Heart className="w-4 h-4" />
                  {t("procurement_interested")}
                </button>
                <button
                  onClick={() => handleExpressInterest(selectedNotice, "subscribed")}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-800"
                >
                  <Bell className="w-4 h-4 text-amber-300" />
                  {t("procurement_subscribeNotice")}
                </button>
                <button
                  onClick={() => handleUnlockNotice(selectedNotice)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-100 text-teal-800 text-sm font-black hover:bg-teal-200"
                >
                  <Lock className="w-4 h-4" />
                  {canUsePaidQuota
                    ? t("procurement_memberUnlock")
                    : freeRemaining > 0
                      ? `${t("procurement_freeUnlock")} (${t("procurement_remaining")} ${freeRemaining})`
                      : t("procurement_freeUsedUp")}
                </button>

                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
                  <p className="font-black text-slate-800 flex items-center gap-2">
                    <WalletCards className="w-4 h-4 text-teal-600" />
                    {t("procurement_quotaTitle")}
                  </p>
                  <p>
                    {t("procurement_freeQuota")}: {t("procurement_used")} {membership?.free_used ?? 0}/{freeQuota},{" "}
                    {t("procurement_remaining")} {freeRemaining}
                  </p>
                  <p>
                    {t("procurement_paidQuota")}: {t("procurement_used")} {membership?.paid_quota_used ?? 0}/
                    {membership?.paid_quota_total ?? 0}, {t("procurement_remaining")}{" "}
                    {membership?.paid_quota_remaining ?? 0}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                  <p className="font-black text-slate-900 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-600" />
                    {t("procurement_paidServiceTitle")}
                  </p>
                  <ul className="space-y-1 leading-5 list-disc pl-4">
                    <li>{t("procurement_paidServiceContact")}</li>
                    <li>{t("procurement_paidServiceAnalysis")}</li>
                    <li>{t("procurement_paidServiceProcess")}</li>
                  </ul>
                  <p className="text-[11px] text-amber-800">{t("procurement_paidServiceManualNote")}</p>
                </div>

                <p className="text-[11px] leading-5 text-slate-500">{t("procurement_actionTip")}</p>
              </div>
            </aside>
          </div>
        </article>
      </div>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((level) => (
                <select
                  key={level}
                  value={selectedIds[level]}
                  onChange={(e) => handleLevelChange(level, e.target.value)}
                  disabled={level > 0 && levels[level].length === 0}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">
                    {level + 1}
                    {t("procurement_level")}
                  </option>
                  {levels[level].map((item) => (
                    <option key={item.id} value={item.id}>
                      {getOptionLabel(item, locale)}
                    </option>
                  ))}
                </select>
              ))}
            </div>
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
            <article
              key={item.id}
              className="border border-slate-200 rounded-xl p-4 min-h-64 flex flex-col hover:border-teal-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black">
                  {item.notice_type || "Notice"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono text-right">{item.deadline}</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mt-3 line-clamp-2">{item.title}</h4>
              <p className="text-xs text-slate-500 mt-3 line-clamp-3">{item.description || t("procurement_noDesc")}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(item.core_locked === false ? (item.unspsc_codes || []) : []).slice(0, 4).map((code, index) => (
                  <span
                    key={`${code.code || index}`}
                    className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-mono text-slate-600"
                  >
                    {code.code || code.name || code.description}
                  </span>
                ))}
              </div>
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
                <div className="text-xs min-w-0">
                  <p className="font-black text-slate-800">{item.estimated_value || t("procurement_budgetPending")}</p>
                  <p className="text-slate-500 truncate">
                    {item.agency || item.organization || t("procurement_unknownAgency")}
                  </p>
                </div>
                <button
                  onClick={() => openNotice(item)}
                  className="px-3 py-2 rounded-lg bg-teal-100 text-teal-800 text-xs font-black hover:bg-teal-200"
                >
                  {t("procurement_detail")}
                </button>
              </div>
            </article>
          ))}
        </div>

        {!loading && visibleItems.length === 0 && (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            {t("procurement_noMatch")}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-5">
          <p className="text-xs text-slate-500">
            {t("procurement_show")} {(page - 1) * serverPageSize + 1} - {Math.min(page * serverPageSize, total)}{" "}
            {t("procurement_items")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("procurement_prev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
            >
              {t("procurement_next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
