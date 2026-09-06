import { useRef, useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDown, Crown, Search, SlidersHorizontal, Target } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { onAppEvent } from "@/core/events";
import { api, clearApiCache } from "@/core/http";
import { unlockNotice } from "../api";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
// ARCH-P2-解耦（2026-09-05）：RecentUnlocks 已从 features/payment 迁移至本 feature，
// 消除 procurement→payment 跨 feature 硬依赖
import { RecentUnlocks } from "../components/RecentUnlocks";
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
  const userId = useUserId();

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

  // ── 模块02 规模条：公告池实时统计（服务端 10 分钟缓存） ──
  const [listingStats, setListingStats] = useState<{
    active: number; todayNew: number; deadline_in_30d: number; with_original_docs: number; bridged: number;
  } | null>(null);
  useEffect(() => {
    api<{
      active: number; todayNew?: number; deadline_in_30d?: number;
      with_original_docs?: number; bridged: number;
    }>("/api/notices/stats")
      .then((d) => setListingStats({
        active: d.active ?? 0,
        todayNew: d.todayNew ?? 0,
        deadline_in_30d: d.deadline_in_30d ?? 0,
        with_original_docs: d.with_original_docs ?? 0,
        bridged: d.bridged ?? 0,
      }))
      .catch(() => {});
  }, []);

  // ── 行业偏好三级降级 ──
  const {
    levels, selectedIds, setLevels, setSelectedIds, prefsMode, setPrefsMode,
    prefsBannerName, deepestCodeId, exitAutoMode, handleLevelChange,
    hasIndustryPrefs, restorePrefsMode,
  } = useIndustryPrefs({ userId, locale: useLocale().locale, setPage, setSelectedNotice });

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
    userId, page, setPage, deepestCodeId,
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
    userId, prefsMode,
    hasSearch: search.query.hasSearch,
    activeSort: search.query.activeSort,
    selectedNotice, variantRef,
  });

  // ── 详情与支付动作 ──
  const actions = useNoticeActions({
    userId, isVip,
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
    if (!userId) return;
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
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* 模块02 深色页头：库存感 + 实时规模条（样图 2-全球采购机会库） */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold text-white flex items-center flex-wrap gap-3">
              {t("procurement_poolTitle")}
              {listingStats && (
                <span className="px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-bold">
                  {listingStats.active.toLocaleString()}+ {t("procurement_statSearchable")}
                </span>
              )}
            </h2>
            <p className="text-slate-300 text-sm mt-1.5">{t("procurement_poolDesc")}</p>
          </div>
          {/* 解锁额度正向文案：>0 显示剩余额度；0/未登录显示升级引导（规划 §5.2 验收红线：不得出现"解锁 0 条"负向提示） */}
          {actions.totalRemaining > 0 ? (
            <span className="shrink-0 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-300/40 text-amber-300 text-xs font-bold whitespace-nowrap">
              {t("statusPanelTotalUnlocks")} {actions.totalRemaining} {t("procurement_items")}
            </span>
          ) : (
            <a href="/membership" className="shrink-0 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-300/40 text-amber-300 text-xs font-bold whitespace-nowrap hover:bg-amber-400/25 transition-colors">
              {t("supplierContactUpgradeBtn")}
            </a>
          )}
        </div>
        {listingStats && (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { value: listingStats.active, label: t("procurement_statSearchable") },
              { value: listingStats.todayNew, label: t("procurement_statTodayNew") },
              { value: listingStats.deadline_in_30d, label: t("procurement_statDeadline30") },
              { value: listingStats.with_original_docs, label: t("procurement_statWithDocs") },
              { value: listingStats.bridged, label: t("procurement_statAiMatchable") },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-xl font-extrabold text-white">{s.value.toLocaleString()}</p>
                <p className="text-2xs text-slate-300 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs">
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

        {userId && <RecentUnlocks userId={userId} onOpenNotice={actions.openNoticeById} />}

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
