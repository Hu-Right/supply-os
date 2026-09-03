import { useRef, useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDown, Crown, Search, SlidersHorizontal, Target } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { onAppEvent } from "@/core/events";
import { clearApiCache } from "@/core/http";
import { unlockNotice } from "../api";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { RecentUnlocks } from "@/features/payment";
import type { NoticeItem } from "../types";
import { NoticeDetail } from "../components/NoticeDetail";
import { UnspcsSelector } from "../components/UnspcsSelector";
import { NoticeSearchBar } from "../components/NoticeSearchBar";
import { Button, LoadingOverlay, ToggleButton } from "@/shared/ui";
import { NoticeList } from "../components/NoticeList";
import { NoticeListSkeleton } from "../components/NoticeListSkeleton";
import { useNoticeSearch } from "../hooks/useNoticeSearch";
import { NOTICE_PAGE_SIZE } from "../constants";
import { useIndustryPrefs } from "../hooks/useIndustryPrefs";
import { useNoticeFeedback } from "../hooks/useNoticeFeedback";
import { useNoticeActions } from "../hooks/useNoticeActions";

export default function ProcurementPage() {
  const { t } = useLocale();
  const { authUser, isVip, refreshAuth } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const userKey = authUser?.id;

  // ── 性能监控：首屏计时 ──
  const firstLoadDoneRef = useRef(false);
  useEffect(() => {
    markPageStart("procurement");
  }, []);

  // T-B10：推荐响应回传的 A/B 桶标记，跨 hook 共享
  const variantRef = useRef<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [unspscExpanded, setUnspscExpanded] = useState(false);

  // ── 行业偏好三级降级 ──
  const {
    levels, selectedIds, setLevels, setSelectedIds, prefsMode, setPrefsMode,
    prefsBannerName, deepestCodeId, exitAutoMode, handleLevelChange,
    hasIndustryPrefs, restorePrefsMode,
  } = useIndustryPrefs({ userKey, locale: useLocale().locale, setPage, setSelectedNotice });

  // ── 恢复行业匹配：清除手动搜索条件并切回行业精准匹配模式 ──
  const handleRestoreIndustryMatch = () => {
    setPage(1);
    setSelectedNotice(null);
    // 清空 URL 搜索条件（表单由 sync effect 自动同步清空）
    router.replace("/procurement");
    // 乐观切回 prefs 模式并重新预选行业路径
    void restorePrefsMode();
  };

  // ── 搜索 + URL 参数事实源 + 列表数据 ──
  const search = useNoticeSearch({
    userId: userKey, page, setPage, deepestCodeId,
    prefsMode, setPrefsMode, setSelectedNotice, variantRef,
    // BUG1 修复：clearSearch 时同步重置 UNSPSC 行业筛选状态
    // BUG2 修复：清除筛选彻底退出行业匹配/推荐模式，回到全量检索
    // 旧代码仅在 recommended 模式退出，prefs 模式保持 → L1 偏好仍参与过滤
    onClear: () => {
      setSelectedIds(["", "", "", "", ""]);
      setLevels((prev) => [prev[0], [], [], [], []]);
      // 清除筛选 = 彻底退出行业匹配/推荐模式，回到全量检索
      setPrefsMode("default");
    },
  });

  // ── 性能监控：首屏完成检测 + 渲染计时 ──
  useEffect(() => {
    if (!firstLoadDoneRef.current && !search.result.loading && search.result.items.length > 0) {
      firstLoadDoneRef.current = true;
      markPageEnd("procurement", search.result.items.length);
    }
  }, [search.result.loading, search.result.items]);
  useRenderTimer("ProcurementPage", [search.result.loading, search.result.items.length]);

  // ── 推荐反馈采集（曝光/点击/dwell/scroll_end/quick_exit/revisit）──
  const feedback = useNoticeFeedback({
    userId: userKey, prefsMode,
    hasSearch: search.query.hasSearch,
    activeSort: search.query.activeSort,
    selectedNotice, variantRef,
  });

  // ── 详情与支付动作 ──
  const actions = useNoticeActions({
    userKey, isVip,
    items: search.result.items,
    setSelectedNotice,
    trackClick: feedback.trackClick,
    trackDetailOpen: feedback.trackDetailOpen,
    refreshAuth,
  });

  // 同步当前详情页公告 ID 到支付 hook：非 VIP 侧边栏常驻面板需要此 ID 创建订单
  useEffect(() => {
    actions.setCurrentNoticeId(selectedNotice?.id ?? null);
  }, [selectedNotice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── P0-8 安全修复：监听支付成功事件，自动解锁公告 ──
  useEffect(() => {
    if (!userKey) return;
    return onAppEvent("supply-os:notice-paid", async ({ noticeId }) => {
      try {
        await unlockNotice(noticeId, "single", 0);
      } catch {
        // 解锁可能已在服务端完成，忽略失败
      }
      // P2-5：解锁成功后清除解锁历史缓存，RecentUnlocks 立即刷新
      clearApiCache("/api/payment/unlocks");
      // SSOT 修复：同时失效会员状态缓存，useMembershipTier 的 60s 缓存标签不再过期展示旧等级
      clearApiCache("/api/membership/status");
      await actions.refreshMembership();
      refreshAuth();
      await actions.openNoticeById(noticeId);
    });
  }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 详情页
  if (selectedNotice) {
    return (
      <>
        {/* SEO: 详情页 noIndex 由 page.tsx metadata 的 robots 控制 */}
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-teal-500" /></div>}>
        <NoticeDetail
        notice={selectedNotice}
        actionMessage={actions.actionMessage}
        membership={actions.membership}
        canUsePaidQuota={actions.canUsePaidQuota}
        isVip={isVip}
        totalRemaining={actions.totalRemaining}
        isLoggedIn={!!authUser}
        detailLoading={actions.detailLoadingId === selectedNotice.id}
        onBack={() => {
          feedback.reportDetailExit();
          actions.closePaywall();
          actions.setDetailLoadingId(null);
          setSelectedNotice(null);
        }}
        onExpressInterest={actions.handleExpressInterest}
        onUnlock={(n: NoticeItem) => actions.handleUnlockNotice(n)}
        onPayUnlock={actions.handlePayUnlock}
      />
      </Suspense>
      </>
    );
  }

  // 列表页
  return (
    <>
    {/* SEO metadata 由 page.tsx metadata 导出在服务端处理 */}
    {/* 搜索/筛选操作全屏蒙层：仅非首次加载时显示，阻断交互 */}
    <LoadingOverlay visible={search.result.loading && firstLoadDoneRef.current} />
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              {t("procurement_poolTitle")}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-bold whitespace-nowrap">
              {t("procurement_total")} {search.result.total} {t("procurement_items")}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold">
              {t("statusPanelTotalUnlocks")} {actions.totalRemaining} {t("procurement_items")}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <NoticeSearchBar
            form={search.form}
            query={search.query}
            countries={search.result.countries}
            agencies={search.result.agencies}
            applySearch={search.actions.applySearch}
            clearSearch={search.actions.clearSearch}
            toggleFeatured={search.actions.toggleFeatured}
          />

          {/* 行业分类（UNSPSC 五级联动）——默认折叠，点击展开 */}
          <div className="border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setUnspscExpanded(!unspscExpanded)}
              className="gap-2 px-0 text-sm text-slate-600 hover:text-teal-700 hover:bg-transparent"
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${unspscExpanded ? "rotate-180" : ""}`} />
              {t("procurement_industryCategory")}
            </Button>
            <div className={`overflow-hidden transition-all duration-200 ease-in-out ${unspscExpanded ? "max-h-60 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"}`}>
              <UnspcsSelector levels={levels} selectedIds={selectedIds} onChange={handleLevelChange} />
            </div>
            <p className="text-xs text-slate-500 mt-2">{t("procurement_poolDesc")}</p>
          </div>

          {/* 操作按钮行：搜索 / 清除筛选 / 只看精选 —— 移至卡片底部 */}
          <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              form="procurement-search-form"
              variant="primary"
              className="font-black whitespace-nowrap"
            >
              <Search className="w-4 h-4 mr-1" />
              {t("procurement_searchBtn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={search.actions.clearSearch}
              className="px-3 whitespace-nowrap"
            >
              {t("procurement_clearSearch")}
            </Button>
            <ToggleButton
              pressed={search.query.activeFeatured}
              onClick={search.actions.toggleFeatured}
              tone="amber"
              className="py-2.5"
            >
              <Crown className="w-3.5 h-3.5" />
              {t("procurement_featuredOnly")}
            </ToggleButton>
            {/* 行业匹配按钮：账号已设置默认行业时始终显示，根据当前模式切换文案和行为 */}
            {hasIndustryPrefs && prefsMode !== "loading" && (
              <ToggleButton
                variant="solid"
                pressed={prefsMode === "prefs"}
                onClick={prefsMode === "prefs" ? exitAutoMode : handleRestoreIndustryMatch}
                className="py-2.5"
              >
                <Target className="w-3.5 h-3.5" />
                {prefsMode === "prefs" ? t("procurement_cancelIndustryMatch") : t("procurement_restoreIndustryMatch")}
              </ToggleButton>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-teal-600" />
            {t("procurement_currentPage")} {page} / {search.result.totalPages} {t("procurement_page")},{" "}
            {t("procurement_eachPage")} {search.result.serverPageSize} {t("procurement_items")}
          </span>
        </div>

        {/* 自动筛选提示条：偏好/推荐模式的状态告知（纯信息展示，无操作入口）
            “查看全部”按钮已全模式移除：推荐态由搜索栏“清除筛选”替代，
            行业匹配态由工具栏“取消行业匹配”按钮替代（同一 exitAutoMode 降级链），
            原文案与实际跳转行为不符，保留会误导用户 */}
        {(prefsMode === "prefs" || prefsMode === "recommended") && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700">
            <span>
              {prefsMode === "prefs"
                ? search.query.hasSearch
                  ? `${t("procurement_prefsBanner", { name: prefsBannerName })} + ${search.query.activeQ ? `“${search.query.activeQ}”` : ""}${search.query.activeCountry ? ` ${search.query.activeCountry}` : ""}${search.query.activeAgency ? ` ${search.query.activeAgency}` : ""}${search.query.activeFeatured ? ` ${t("procurement_featuredOnly")}` : ""}`.replace(/^\s*\+\s*/, "").trim()
                  : t("procurement_prefsBanner", { name: prefsBannerName })
                : t("procurement_recommendedBanner")}
            </span>
          </div>
        )}

        {userKey && <RecentUnlocks userKey={userKey} onOpenNotice={actions.openNoticeById} />}

        {search.result.error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{search.result.error}</div>}

        {/* 首次加载显示骨架屏（数量对齐 NOTICE_PAGE_SIZE），后续搜索由 LoadingOverlay 覆盖 */}
        {search.result.loading && search.result.items.length === 0
          ? <NoticeListSkeleton count={NOTICE_PAGE_SIZE} />
          : <NoticeList
              items={search.result.items}
              loading={search.result.loading}
              page={page}
              totalPages={search.result.totalPages}
              serverPageSize={search.result.serverPageSize}
              total={search.result.total}
              setPage={setPage}
              openNotice={actions.openNotice}
              feedbackEnabled={feedback.feedbackEnabled}
              observeCard={feedback.observeCard}
            />
        }
      </section>
    </div>
    </>
  );
}
