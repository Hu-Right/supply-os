/**
 * 全球采购机会库页 — 容器
 * @module features/procurement/pages/ProcurementPage
 * @description 2026-10 组件化拆分（408→约 250 行）：搜索/筛选面板、结果头部、偏好提示条、
 *              结果列表分支移入 ../components/procurement-page/*，JSX 与行为逐字不变；
 *              本文件保留 hooks 编排、支付事件监听与首屏计时。
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUserId } from "@/core/auth";
import { onAppEvent, emitAppEvent } from "@/core/events";
import { clearApiCache } from "@/core/http";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { RecentViews } from "../components/RecentViews";
import type { NoticeItem } from "../types";
import { LoadingOverlay } from "@/shared/ui";
import { ListingStatsBar } from "../components/ListingStatsBar";
import { useNoticeSearch } from "../hooks/useNoticeSearch";
import type { SearchResultsInitial } from "../hooks/search/useSearchResults";
import { useListingStats } from "../hooks/useListingStats";
import { useCommodityCascade } from "../hooks/useCommodityCascade";
import { useNoticeFeedback } from "../hooks/useNoticeFeedback";
import { useNoticeActions } from "../hooks/useNoticeActions";
import { SearchFilterSection } from "../components/procurement-page/SearchFilterSection";
import { ResultsHeader } from "../components/procurement-page/ResultsHeader";
import { ResultsList, MatchRelaxedHint } from "../components/procurement-page/ResultsSections";

export default function ProcurementPage({
  initialResults,
}: {
  initialResults?: SearchResultsInitial;
} = {}) {
  const { authUser, isVip, refreshAuth, authReady } = useAuth();
  const router = useRouter();
  const userId = useUserId();

  /** 按 id 打开详情：统一走独立详情路由（未登录仍先弹登录，保持原门槛） */
  const openNoticeByIdRoute = useCallback((noticeId: number) => {
    const from = `/procurement${window.location.search}`;
    router.push(`/procurement/notice/${noticeId}/detail?from=${encodeURIComponent(from)}`);
  }, [router]);

  /** 打开详情：统一走独立详情路由（未登录仍先弹登录，保持原门槛） */
  const openNoticeRoute = useCallback((notice: NoticeItem) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    openNoticeByIdRoute(notice.noticePk);
  }, [authUser, openNoticeByIdRoute]);

  // 老链接 ?notice_id= 的兼容跳转已移除（2026-11-25，不再向后兼容）：
  // 详情入口统一为 /procurement/notice/{id}/detail，列表页不再解析旧查询参数。

  // ── 性能监控：首屏计时 ──
  const firstLoadDoneRef = useRef(false);
  useEffect(() => {
    markPageStart("procurement");
  }, []);

  // T-B10：推荐响应回传的 A/B 桶标记，跨 hook 共享
  const variantRef = useRef<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  // 列表页不再承载内嵌详情；保留 setter 形状给搜索/动作 hooks，实际不写选中态
  const noopSetSelectedNotice = useCallback(() => {}, []);
  // chip 行下线后五级下拉是唯一大类入口，因此默认展开（收起只是用户自己选择精简界面）
  const [commodityExpanded, setCommodityExpanded] = useState(true);

  // ── 规模条数据（已提取至 hook） ──
  const listingStats = useListingStats();

  // ── 五级下拉选项：品目大类 → 段 → 族 → 类 → 品目 ──
  const commodity = useCommodityCascade();

  // ── 搜索 + URL 参数事实源 + 列表数据 ──
  const search = useNoticeSearch({
    userId, page, setPage, variantRef, initialResults,
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
    userId,
    hasSearch: search.query.hasSearch,
    activeSort: search.query.activeSort,
    selectedNotice: null, variantRef,
  });

  // ── 详情与支付动作 ──
  const actions = useNoticeActions({
    userId, isVip, authReady,
    items: search.result.items,
    setSelectedNotice: noopSetSelectedNotice,
    onOpenNotice: openNoticeByIdRoute,
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

  // ── 详情深链：旧链接/支付回跳已统一重定向到独立详情路由，列表页不再维护 ?notice_id 选中态 ──


  // ── P0-8：监听支付成功事件（公告单购回跳）。2026-11-27 解锁调用已随次数体系
  // 下线删除：打开详情由套餐判定直接放行；保留缓存失效/会员刷新/导航行为。──
  useEffect(() => {
    if (!userId) return;
    return onAppEvent("supply-os:notice-paid", async ({ noticeId }) => {
      // 清除查看历史缓存，RecentViews 立即刷新；同步失效会员状态缓存，避免展示旧等级
      clearApiCache("/api/payment/access-records");
      clearApiCache("/api/membership/status");
      await actions.refreshMembership();
      refreshAuth();
      router.push(`/procurement/notice/${noticeId}/detail`);
    });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 列表页
  return (
    <>
    {/* SEO metadata 由 page.tsx metadata 导出在服务端处理 */}
    {/* 搜索/筛选操作全屏蒙层：仅非首次加载时显示，阻断交互 */}
    <LoadingOverlay visible={search.result.loading && firstLoadDoneRef.current} />
    <div className="space-y-2 sm:space-y-5 pb-20 md:pb-0">
      {/* 模块02 深色页头：库存感 + 实时规模条（已提取为独立组件） */}
      <ListingStatsBar stats={listingStats} loading={listingStats.loading} />

      <SearchFilterSection
        search={search}
        commodity={commodity}
        commodityExpanded={commodityExpanded}
        onToggleExpanded={() => setCommodityExpanded(!commodityExpanded)}
        advancedSearchEntitled={actions.membership?.gates?.advanced_keyword_search === "free" || actions.membership?.gates?.advanced_keyword_search === "included"}
        keywordLibEntitled={actions.membership?.gates?.product_keyword_lib === "free" || actions.membership?.gates?.product_keyword_lib === "included"}
      />

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <ResultsHeader
          query={search.query}
          displayTotal={search.query.hasSearch ? search.result.total : ((listingStats.active || 0) || search.result.total)}
          onClearSearch={search.actions.clearSearch}
          onSortChange={(sort) => search.actions.applySearch(sort)}
        />

        {/* 商机列表页只保留「最近查看」；「我的收藏」快捷区已下线（收藏仍在卡片/详情页与「我的记录」中可用） */}
        {userId && <RecentViews userId={userId} onOpenNotice={(noticeId) => {
          if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
          const from = `/procurement${window.location.search}`;
          router.push(`/procurement/notice/${noticeId}/detail?from=${encodeURIComponent(from)}`);
        }} />}

        {search.result.error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{search.result.error}</div>}

        {/* 放宽说明必须贴着结果列表：此前置于搜索面板上方，用户先看到「共 N 条」再看解释，
            易误读为硬 AND 命中数；放宽仅在 AND 零结果时触发，文案以「未找到…」直述零命中 */}
        {search.result.matchRelaxed && <MatchRelaxedHint />}

        <ResultsList
          result={search.result}
          page={page}
          setPage={setPage}
          openNotice={openNoticeRoute}
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

