import { useEffect, useRef, useState } from "react";
import { Crown, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { onAppEvent } from "@/core/events";
import { RecentUnlocks } from "@/features/payment";
import type { NoticeItem } from "../types";
import { fetchUnspscIndustries } from "../api";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { NoticeSearchBar } from "../components/NoticeSearchBar";
import { NoticeList } from "../components/NoticeList";
import { useNoticeSearch } from "../hooks/useNoticeSearch";
import { useIndustryPrefs } from "../hooks/useIndustryPrefs";
import { useNoticeFeedback } from "../hooks/useNoticeFeedback";
import { useNoticeActions } from "../hooks/useNoticeActions";

export default function ProcurementPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const userKey = authUser?.user_key;

  const [page, setPage] = useState(1);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  // T-B10（本地差异 #15）：推荐响应回传的 A/B 桶标记，反馈埋点原样携带供指标按桶聚合
  const variantRef = useRef<string | undefined>(undefined);

  // ── 账号默认行业偏好三级降级 + UNSPSC 级联（本地差异 #5 配套前端）──
  const {
    levels,
    setLevels,
    selectedIds,
    prefsMode,
    setPrefsMode,
    prefsBannerName,
    deepestCodeId,
    exitAutoMode,
    handleLevelChange,
  } = useIndustryPrefs({ userKey, locale, setPage, setSelectedNotice });

  // ── 公采搜索栏 + 列表数据（本地差异 #6：G.3 服务端搜索，URL 参数为唯一事实源）──
  const {
    activeSort,
    hasSearch,
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
    countries,
    applySearch,
    clearSearch,
    items,
    total,
    serverPageSize,
    totalPages,
    loading,
    error,
    setError,
  } = useNoticeSearch({
    userKey,
    page,
    setPage,
    deepestCodeId,
    prefsMode,
    setPrefsMode,
    setSelectedNotice,
    variantRef,
  });

  // ── T-B9 推荐反馈采集 + T-C7 隐式偏好信号（本地差异 #13：D.7 + #16：C.3.6）──
  const {
    feedbackEnabled,
    observeCard,
    reportDetailExit,
    trackClick,
    trackDetailOpen,
  } = useNoticeFeedback({
    userKey,
    prefsMode,
    hasSearch,
    activeSort,
    selectedNotice,
    variantRef,
  });

  // ── 详情 / 支付动作域（会员配额、解锁、付费墙、支付回跳对账）──
  const {
    membership,
    paidPlans,
    actionMessage,
    freeRemaining,
    freeQuota,
    canUsePaidQuota,
    detailLoadingId,
    setDetailLoadingId,
    openNotice,
    openNoticeById,
    handlePayUnlock,
    handleUnlockNotice,
    handleExpressInterest,
    refreshMembership,
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    setPaymentProvider,
    closePaywall,
    createNoticeOrder,
    markPaid,
  } = useNoticeActions({ userKey, isVip, items, setSelectedNotice, trackClick, trackDetailOpen });

  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then((data) => setLevels((prev) => [Array.isArray(data) ? data : [], prev[1], prev[2], prev[3], prev[4]]))
      .catch(() => setError("Failed to load UNSPSC categories."));
  }, []);

  // 同页支付成功（mock/弹窗轮询）：刷新配额并展开已解锁详情
  useEffect(() => {
    const onNoticePaid = (detail: { noticeId: number }) => {
      if (detail?.noticeId) {
        void refreshMembership().then(() => openNoticeById(Number(detail.noticeId)));
      }
    };
    return onAppEvent("supply-os:notice-paid", onNoticePaid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, userKey]);

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
          reportDetailExit(); // T-C7：返回列表时结算 dwell / quick_exit
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
          <NoticeSearchBar
            qInput={qInput}
            setQInput={setQInput}
            countryInput={countryInput}
            setCountryInput={setCountryInput}
            fromInput={fromInput}
            setFromInput={setFromInput}
            toInput={toInput}
            setToInput={setToInput}
            valueMinInput={valueMinInput}
            setValueMinInput={setValueMinInput}
            valueMaxInput={valueMaxInput}
            setValueMaxInput={setValueMaxInput}
            windowInput={windowInput}
            setWindowInput={setWindowInput}
            typeInput={typeInput}
            setTypeInput={setTypeInput}
            activeSort={activeSort}
            countries={countries}
            applySearch={applySearch}
            clearSearch={clearSearch}
          />
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

        <NoticeList
          items={items}
          loading={loading}
          page={page}
          totalPages={totalPages}
          serverPageSize={serverPageSize}
          total={total}
          setPage={setPage}
          openNotice={openNotice}
          feedbackEnabled={feedbackEnabled}
          observeCard={observeCard}
        />
      </section>
    </div>
  );
}
