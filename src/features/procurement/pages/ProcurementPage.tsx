import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Crown, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { RecentUnlocks } from "@/features/payment/components/RecentUnlocks";
import type { NoticeItem } from "../types";
import { NoticeCard } from "../components/NoticeCard";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { NoticeSearchBar } from "../components/NoticeSearchBar";
import { NoticeList } from "../components/NoticeList";
import { useNoticeSearch, PAGE_SIZE } from "../hooks/useNoticeSearch";
import { useIndustryPrefs } from "../hooks/useIndustryPrefs";
import { useNoticeFeedback } from "../hooks/useNoticeFeedback";
import { useNoticeActions } from "../hooks/useNoticeActions";

export default function ProcurementPage() {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const userKey = authUser?.user_key;

  // T-B10：推荐响应回传的 A/B 桶标记，跨 hook 共享
  const variantRef = useRef<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);

  // ── 行业偏好三级降级 ──
  const {
    levels, selectedIds, prefsMode, setPrefsMode,
    prefsBannerName, deepestCodeId, exitAutoMode, handleLevelChange,
  } = useIndustryPrefs({ userKey, locale: useLocale().locale, setPage, setSelectedNotice });

  // ── 搜索 + URL 参数事实源 + 列表数据 ──
  const search = useNoticeSearch({
    userKey, page, setPage, deepestCodeId,
    prefsMode, setPrefsMode, setSelectedNotice, variantRef,
  });

  // ── 推荐反馈采集（曝光/点击/dwell/scroll_end/quick_exit/revisit）──
  const feedback = useNoticeFeedback({
    userKey, prefsMode,
    hasSearch: search.hasSearch,
    activeSort: search.activeSort,
    selectedNotice, variantRef,
  });

  // ── 详情与支付动作 ──
  const actions = useNoticeActions({
    userKey, isVip,
    items: search.items,
    setSelectedNotice,
    trackClick: feedback.trackClick,
    trackDetailOpen: feedback.trackDetailOpen,
  });

  // 详情页
  if (selectedNotice) {
    return (
      <NoticeDetail
        notice={selectedNotice}
        actionMessage={actions.actionMessage}
        membership={actions.membership}
        freeRemaining={actions.freeRemaining}
        freeQuota={actions.freeQuota}
        canUsePaidQuota={actions.canUsePaidQuota}
        isVip={isVip}
        detailLoading={actions.detailLoadingId === selectedNotice.id}
        onBack={() => {
          feedback.reportDetailExit();
          actions.closePaywall();
          actions.setDetailLoadingId(null);
          setSelectedNotice(null);
        }}
        onExpressInterest={actions.handleExpressInterest}
        onUnlock={(n) => actions.handleUnlockNotice(n)}
        onPayUnlock={actions.handlePayUnlock}
        payment={{
          plans: actions.paidPlans,
          paywallNotice: actions.paywallNotice,
          order: actions.paymentOrder,
          provider: actions.paymentProvider,
          busyPlanCode: actions.busyPlanCode,
          message: actions.paymentMessage,
          onProviderChange: actions.setPaymentProvider,
          onCreateOrder: actions.createNoticeOrder,
          onMockPaid: actions.markPaid,
          onClose: actions.closePaywall,
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
            <p className="text-xs text-slate-500 mt-1">{t("procurement_poolDesc", { count: actions.freeQuota })}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {t("procurement_total")} {search.total} {t("procurement_items")}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold">
              {actions.canUsePaidQuota
                ? t("procurement_vipActive")
                : `${t("procurement_freeTrial")} ${actions.freeRemaining} ${t("procurement_items")}`}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <UnspcsSelector levels={levels} selectedIds={selectedIds} onChange={handleLevelChange} />
          <NoticeSearchBar
            qInput={search.qInput}
            setQInput={search.setQInput}
            countryInput={search.countryInput}
            setCountryInput={search.setCountryInput}
            fromInput={search.fromInput}
            setFromInput={search.setFromInput}
            toInput={search.toInput}
            setToInput={search.setToInput}
            valueMinInput={search.valueMinInput}
            setValueMinInput={search.setValueMinInput}
            valueMaxInput={search.valueMaxInput}
            setValueMaxInput={search.setValueMaxInput}
            windowInput={search.windowInput}
            setWindowInput={search.setWindowInput}
            typeInput={search.typeInput}
            setTypeInput={search.setTypeInput}
            activeSort={search.activeSort}
            countries={search.countries}
            applySearch={search.applySearch}
            clearSearch={search.clearSearch}
            activeFeatured={search.activeFeatured}
            toggleFeatured={search.toggleFeatured}
          />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-teal-600" />
            {t("procurement_currentPage")} {page} / {search.totalPages} {t("procurement_page")},{" "}
            {t("procurement_eachPage")} {search.serverPageSize} {t("procurement_items")}
          </span>
          {search.loading && <span className="font-bold text-teal-600">{t("procurement_loading")}</span>}
        </div>

        {/* 自动筛选提示条：偏好/推荐模式可一键退出回全量 */}
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

        {userKey && <RecentUnlocks userKey={userKey} onOpenNotice={actions.openNoticeById} />}

        {search.error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{search.error}</div>}

        <NoticeList
          items={search.items}
          loading={search.loading}
          page={page}
          totalPages={search.totalPages}
          serverPageSize={search.serverPageSize}
          total={search.total}
          setPage={setPage}
          openNotice={actions.openNotice}
          feedbackEnabled={feedback.feedbackEnabled}
          observeCard={feedback.observeCard}
        />
      </section>
    </div>
  );
}
