/**
 * 全球采购机会库页 — 容器
 * @module features/procurement/pages/ProcurementPage
 * @description 2026-10 组件化拆分（408→约 250 行）：搜索/筛选面板、结果头部、偏好提示条、
 *              结果列表分支移入 ../components/procurement-page/*，JSX 与行为逐字不变；
 *              本文件保留 hooks 编排、支付事件监听与首屏计时。
 */
import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUserId } from "@/core/auth";
import { onAppEvent } from "@/core/events";
import { clearApiCache } from "@/core/http";
import { unlockNotice } from "../api";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { RecentUnlocks } from "../components/RecentUnlocks";
import { FavoriteNotices } from "../components/FavoriteNotices";
import type { NoticeItem } from "../types";
import { NoticeDetail } from "../components/NoticeDetail";
import { LoadingOverlay } from "@/shared/ui";
import { ListingStatsBar } from "../components/ListingStatsBar";
import { useNoticeSearch } from "../hooks/useNoticeSearch";
import { useListingStats } from "../hooks/useListingStats";
import { useIndustryPrefs } from "../hooks/useIndustryPrefs";
import { useCommodityCascade } from "../hooks/useCommodityCascade";
import { useNoticeFeedback } from "../hooks/useNoticeFeedback";
import { useNoticeActions } from "../hooks/useNoticeActions";
import { SearchFilterSection } from "../components/procurement-page/SearchFilterSection";
import { ResultsHeader } from "../components/procurement-page/ResultsHeader";
import { PrefsBanner, ResultsList, MatchRelaxedHint } from "../components/procurement-page/ResultsSections";

export default function ProcurementPage() {
  const { authUser, isVip, refreshAuth, authReady } = useAuth();
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
  // chip 行下线后五级下拉是唯一大类入口，因此默认展开（收起只是用户自己选择精简界面）
  const [commodityExpanded, setCommodityExpanded] = useState(true);

  // ── 规模条数据（已提取至 hook） ──
  const listingStats = useListingStats();

  // ── 品目匹配模式三级降级（选中态不在这里：五级下拉以 URL 为唯一事实源）──
  const {
    prefsMode, setPrefsMode, prefsBannerName, exitAutoMode,
    hasIndustryPrefs, restorePrefsMode, markManualCategoryPick,
  } = useIndustryPrefs({ userId, setPage });

  // ── 五级下拉选项：品目大类 → 段 → 族 → 类 → 品目 ──
  const commodity = useCommodityCascade();

  // ── 恢复品目匹配：清除手动搜索条件并切回品目精准匹配模式（hook 名 useIndustryPrefs 不动）──
  const handleRestoreCommodityMatch = () => {
    setPage(1);
    setSelectedNotice(null);
    // 清空 URL 搜索条件（含 commodity：URL 是筛选事实源，回到无参就是无筛选）
    router.replace("/procurement");
    // 乐观切回 prefs 模式并重新解析偏好路径名称
    void restorePrefsMode();
  };

  // ── 搜索 + URL 参数事实源 + 列表数据 ──
  const search = useNoticeSearch({
    userId, page, setPage,
    prefsMode, setPrefsMode, setSelectedNotice, variantRef,
    // BUG2 修复：清除筛选彻底退出品目匹配/推荐模式，回到全量检索
    // （旧代码仅在 recommended 模式退出，prefs 模式保持 → 偏好仍参与过滤）
    // BUG1 对应的「同步重置旧品类码筛选态」已不需要：下拉选中态就是 URL，
    // clearSearch 的 router.replace(pathname) 已把它一并清掉。
    onClear: () => {
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
    userId, isVip, authReady,
    items: search.result.items,
    setSelectedNotice,
    trackClick: feedback.trackClick,
    trackDetailOpen: feedback.trackDetailOpen,
  });

  // P0 配套：卡片收藏回调稳定引用——之前内联 (id) => void ... 每次父渲染
  // 新建函数，直接击穿 NoticeList/NoticeCard 的 React.memo
  const { toggleFavorite } = actions;
  const handleToggleFavorite = useCallback(
    (id: number) => { void toggleFavorite(id); },
    [toggleFavorite],
  );

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
        detailLoading={actions.detailLoadingId === selectedNotice.noticePk}
        onBack={() => {
          feedback.reportDetailExit();
          actions.setDetailLoadingId(null);
          setSelectedNotice(null);
        }}
        onExpressInterest={actions.handleExpressInterest}
        onUnlock={(n: NoticeItem) => actions.handleUnlockNotice(n)}
        onOpenNotice={actions.openNotice}
        favorited={actions.isFavorite(selectedNotice.noticePk)}
        onToggleFavorite={() => void actions.toggleFavorite(selectedNotice.noticePk)}
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
      {/* 模块02 深色页头：库存感 + 实时规模条（已提取为独立组件） */}
      <ListingStatsBar stats={listingStats} />

      <SearchFilterSection
        search={search}
        commodity={commodity}
        markManualCategoryPick={markManualCategoryPick}
        commodityExpanded={commodityExpanded}
        onToggleExpanded={() => setCommodityExpanded(!commodityExpanded)}
        advancedSearchEntitled={actions.membership?.gates?.advanced_keyword_search === "free" || actions.membership?.gates?.advanced_keyword_search === "included"}
        keywordLibEntitled={actions.membership?.gates?.product_keyword_lib === "free" || actions.membership?.gates?.product_keyword_lib === "included"}
        hasIndustryPrefs={hasIndustryPrefs}
        prefsMode={prefsMode}
        onTogglePrefs={() => { if (prefsMode === "prefs") { void exitAutoMode(); } else { handleRestoreCommodityMatch(); } }}
      />

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <ResultsHeader
          query={search.query}
          displayTotal={search.query.hasSearch ? search.result.total : ((listingStats.active || 0) || search.result.total)}
          onClearSearch={search.actions.clearSearch}
          onSortChange={(sort) => search.actions.applySearch(sort)}
        />

        <PrefsBanner prefsMode={prefsMode} prefsBannerName={prefsBannerName} query={search.query} />

        {userId && actions.favoriteIds.size > 0 && (
          <FavoriteNotices favoriteIds={actions.favoriteIds} onOpenNotice={actions.openNoticeById} />
        )}
        {userId && <RecentUnlocks userId={userId} onOpenNotice={actions.openNoticeById} />}

        {search.result.error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{search.result.error}</div>}

        {/* 放宽说明必须贴着结果列表：此前置于搜索面板上方，用户先看到「共 N 条」再看解释，
            易误读为硬 AND 命中数；放宽仅在 AND 零结果时触发，文案以「未找到…」直述零命中 */}
        {search.result.matchRelaxed && <MatchRelaxedHint />}

        <ResultsList
          result={search.result}
          page={page}
          setPage={setPage}
          openNotice={actions.openNotice}
          feedbackEnabled={feedback.feedbackEnabled}
          observeCard={feedback.observeCard}
          favoriteIds={actions.favoriteIds}
          onToggleFavorite={handleToggleFavorite}
        />
      </section>
    </div>
    </>
  );
}

