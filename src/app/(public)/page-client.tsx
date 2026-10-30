"use client";

/**
 * 新首页 — 客户端薄壳
 * New Homepage — Client Shell
 *
 * @description 组合各区块组件，不包含业务逻辑。
 *              页面结构 / Page structure:
 *   1. Hero 区 — 采购机会搜索入口
 *   2. 实时数字墙 — 规模指标
 *   3. 热门行业
 *   4. 全球商机地图
 *   5. 三栏内容 — 今日热门商机 / 优质供应商 / 最新 RFQ 询价
 *   6. 平台介绍 — 定位 + 数据背书 + 核心优势 + 四步路径 + CTA
 */
import {
  HeroSection,
  StatsWall,
  HotTopicsSection,
  WorldMapSection,
  ContentColumns,
  AboutSection,
  IdentityChoiceBanner,
} from "@/features/home";
import type { HomeStatsData } from "@/features/home";
import type { HomeContentSnapshot } from "@/lib/services/home-snapshot";
import type { HomeContentData } from "@/features/home/components/ContentColumns";
import { ErrorBoundary } from "@/shared/ui";

/** 首页全局错误降级 UI */
function HomeErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-4">
        <p className="text-lg font-bold text-slate-700">页面加载异常</p>
        <p className="text-sm text-slate-500">请刷新页面重试，如问题持续请联系客服</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}

export default function PageClient({ initialHome, initialContent }: { initialHome?: HomeStatsData; initialContent?: HomeContentSnapshot } = {}) {
  return (
    <ErrorBoundary fallback={<HomeErrorFallback />}>
      <div className="min-h-screen bg-white">
        <HeroSection />
        <IdentityChoiceBanner />
        <StatsWall initialHome={initialHome} />
        <HotTopicsSection />
        <WorldMapSection initialHome={initialHome} />
        {/* RSC 快照行 → 卡片项：与 apiCached<{ items: HomeNoticeItem[] }> 泛型同一条信任口径
            （视图行即卡片契约，无运行时校验），薄壳投影一次，features 内不引 lib 类型 */}
        <ContentColumns initialContent={initialContent as HomeContentData | undefined} />
        <AboutSection initialHome={initialHome} />
      </div>
    </ErrorBoundary>
  );
}
