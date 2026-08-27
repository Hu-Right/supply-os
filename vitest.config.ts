import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Next.js 迁移后 tsconfig 为 jsx: preserve，vitest 需显式使用 automatic runtime，
  // 否则 JSX 转译为 React.createElement 而测试文件未导入 React（"React is not defined"）。
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    pool: "forks",
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["node_modules/**", "tests/e2e/**", "tests/e2e-frontend/**", "tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // 仅统计可单元测试的纯逻辑文件（排除 React 组件、DB 依赖、路由接线等）
      include: [
        // ── server/utils（纯工具函数）──
        "src/lib/utils/**/*.ts",
        // ── server/data（静态数据）──
        "src/lib/data/countryNames.ts",
        // agency-i18n 大型静态数据表（>500 行）仅做结构测试，不纳入覆盖率统计
        // "src/lib/data/agency-i18n/**/*.ts",
        // "src/lib/services/agency-i18n-data.ts",  // barrel re-export，无独立逻辑
        // ── server/config ──
        "src/lib/config/env.ts",
        // ── server/services — 可独立测试的子模块 ──
        "src/lib/services/amount/parser.ts",
        "src/lib/services/amount/view-rollup.ts",
        "src/lib/services/amount/cache-backfill.ts",

        "src/lib/services/bid-report/constants.ts",
        "src/lib/services/bid-report/merge.ts",
        "src/lib/services/bid-report/build.ts",
        "src/lib/services/bid-report/builders.ts",
        "src/lib/services/bid-report/preview.ts",
        "src/lib/services/recommend/ab-testing.ts",
        "src/lib/services/recommend/recall.ts",
        "src/lib/services/recommend/rerank.ts",
        "src/lib/services/recommend/scoring.ts",
        "src/lib/services/recommend/text-similarity.ts",
        "src/lib/services/recommend/interest-decay.ts",
        "src/lib/services/recommend/weight-profile.ts",
        "src/lib/services/search-orchestrator/metrics.ts",
        "src/lib/services/search-orchestrator/params.ts",
        "src/lib/services/search-orchestrator/filter-builder.ts",
        "src/lib/services/search-orchestrator/meili-query.ts",
        "src/lib/services/search-orchestrator/reference-fast-path.ts",
        "src/lib/services/search-orchestrator/rebuild-trigger.ts",
        "src/lib/services/search-orchestrator/mysql-fallback.ts",
        "src/lib/services/unspsc/parser.ts",
        "src/lib/services/unspsc/tree-cache.ts",
        "src/lib/services/unspsc/interest.ts",
        // ── notice-search 子模块 ──
        "src/lib/services/notice-search/agencies/translate.ts",
        "src/lib/services/notice-search/agencies/cache.ts",
        "src/lib/services/notice-search/countries.ts",
        "src/lib/services/notice-search/stats.ts",
        "src/lib/services/notice-search/cache.ts",
        // ── search-orchestrator 子模块 ──
        "src/lib/services/search-orchestrator/format.ts",
        "src/lib/services/search-orchestrator/mode-resolver.ts",
        "src/lib/services/search-orchestrator/detail-fetch.ts",
        // ── translation 子模块 ──
        "src/lib/services/translation/fetchWithTimeout.ts",
        "src/lib/services/translation/chain.ts",
        // ── notices ──
        "src/lib/services/notices/featured.ts",
        // ── industry-profile ──
        "src/lib/services/industry-profile/resolve.ts",
        // ── 以下为 DB 重度依赖/外部服务，排除出覆盖率统计 ──
        // server/services/recommend/index.ts (推荐编排，DB)
        // server/services/search-orchestrator/* (搜索编排，DB/Meilisearch)
        // server/services/notice-actions.ts (解锁事务，DB)
        // server/services/reportCacheCleanup.ts (定时调度)
        // server/services/sms.ts (外部 SMS API)
        "src/lib/services/unspsc/filter.ts",
        // ── server/services — 独立服务文件 ──
        "src/lib/services/auth.ts",
        "src/lib/services/email.ts",
        "src/lib/services/jwt.ts",
        "src/lib/services/leads.ts",
        "src/lib/services/membership-status.ts",
        "src/lib/services/membership-upgrade.ts",
        "src/lib/services/suppliers.ts",
        "src/lib/services/paymentHistory.ts",
        "src/lib/services/agencyAliasSeed.ts",
        // ── meilisearch ──
        "src/lib/services/meilisearch/segmentZh.ts",
        // ── search-sync（已有测试的子模块）──
        "src/lib/services/search-sync/sync-queue.ts",
        "src/lib/services/search-sync/sync-retry-queue.ts",
        // ── data-cleanup ──
        "src/lib/services/data-cleanup/engine.ts",
        // ── quality-monitor ──
        "src/lib/services/quality-monitor/snapshot.ts",
        // ── server/payment ──
        "src/lib/payment/keys.ts",
        "src/lib/payment/MockProvider.ts",
        "src/lib/payment/PaymentService.ts",
        "src/lib/payment/AlipayProvider.ts",
        "src/lib/payment/WechatProvider.ts",
        "src/lib/payment/qr.ts",
        "src/lib/payment/fulfillment.ts",
        // ── server/routes（由集成测试覆盖，不纳入单元测试覆盖率统计）──
        // server/routes/** 已在 tests/integration/ 中有完整覆盖
        // ── src/core — 纯逻辑模块 ──
        "src/core/api/**/*.ts",
        "src/core/events/events.ts",
        "src/core/http/api-client.ts",
        "src/core/http/buildQuery.ts",
        "src/core/i18n/detectScript.ts",
        "src/core/i18n/locales.ts",
        "src/core/i18n/pickLocale.ts",
        "src/core/payment/env-detector.ts",
        "src/core/perf/reporter.ts",
        "src/core/unspsc/api.ts",
        "src/core/unspsc/label.ts",
        // ── src/features — 纯逻辑/工具 ──
        "src/features/membership/api.ts",
        "src/features/membership/utils.ts",
        "src/features/procurement/constants.ts",
        "src/features/procurement/notice-type.ts",
        "src/features/procurement/api/feedback.ts",
        "src/features/procurement/api/notices.ts",
        // membership.ts 是 re-export，不含逻辑
        "src/features/procurement/hooks/searchFormReducer.ts",
        "src/features/procurement/utils/detailViewCount.ts",
        "src/features/procurement/utils/formatDeadlineZh.ts",
        // ── src/features — Phase 4 新增 ──
        "src/features/services/data.ts",
        "src/features/showroom/api.ts",
        "src/features/supplier/api.ts",
        "src/features/crm/api.ts",
        "src/features/training/api.ts",
        "src/features/payment/hooks/useOrderHistory.ts",
        "src/features/payment/hooks/useRecordsSummary.ts",
        // ── src/features — Phase 3 新增 ──
        "src/shared/layout/nav-tabs.ts",
        // 以下 React hooks 需要 App 上下文，由组件测试覆盖但不纳入覆盖率统计
        // "src/features/procurement/api/membership.ts",  // barrel re-export
        // "src/features/procurement/hooks/search/useSearchQuery.ts",  // React hook
        // "src/features/procurement/hooks/search/useSearchFormState.ts",  // React hook
        // "src/features/training/hooks/useTrainingModals.ts",  // React hook
        // "src/features/membership/hooks/useMembershipTier.ts",  // React hook
        // ── src/shared — 纯逻辑 + 组件 ──
        "src/shared/auth/**/*.ts",
        "src/shared/data/**/*.ts",
        // 注：shared/ui、shared/layout、shared/filters 的 React 组件 (*.tsx)
        // 已有测试覆盖但 JSX 渲染语句拉低覆盖率百分比，不纳入统计。
        // 测试文件保留作为回归保障。
      ],
      exclude: [
        "src/__tests__/**",
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/lib/**/*.test.ts",
        "src/lib/db/**",
        "src/lib/lifecycle/**",
        "src/lib/bootstrap.ts",
        "src/lib/context.ts",
        "server.ts",
        "src/vite-env.d.ts",
        // barrel re-export 入口（无逻辑）
        "src/shared/layout/index.ts",
        "src/shared/ui/index.ts",
        "src/shared/filters/index.ts",
        // 复杂全局状态 hooks（依赖 DOM/App 上下文，不适合单元测试）
        "src/shared/layout/useAppEvents.ts",
        "src/shared/layout/useAppModals.ts",
        "src/shared/layout/useVersionCheck.ts",
        "src/shared/ui/useInfiniteScroll.ts",
      ],
    },
  },
});
