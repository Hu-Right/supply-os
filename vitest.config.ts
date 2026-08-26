import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
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
        "server/utils/**/*.ts",
        // ── server/data（静态数据）──
        "server/data/countryNames.ts",
        "server/data/agency-i18n/**/*.ts",
        "server/services/agency-i18n-data.ts",
        // ── server/config ──
        "server/config/env.ts",
        // ── server/services — 可独立测试的子模块 ──
        "server/services/amount/parser.ts",
        "server/services/amount/view-rollup.ts",
        "server/services/amount/cache-backfill.ts",

        "server/services/bid-report/constants.ts",
        "server/services/bid-report/merge.ts",
        "server/services/bid-report/build.ts",
        "server/services/bid-report/builders.ts",
        "server/services/bid-report/preview.ts",
        "server/services/recommend/ab-testing.ts",
        "server/services/recommend/recall.ts",
        "server/services/recommend/rerank.ts",
        "server/services/recommend/scoring.ts",
        "server/services/recommend/text-similarity.ts",
        "server/services/recommend/interest-decay.ts",
        "server/services/recommend/weight-profile.ts",
        "server/services/search-orchestrator/metrics.ts",
        "server/services/search-orchestrator/params.ts",
        "server/services/search-orchestrator/filter-builder.ts",
        "server/services/search-orchestrator/meili-query.ts",
        "server/services/search-orchestrator/reference-fast-path.ts",
        "server/services/search-orchestrator/rebuild-trigger.ts",
        "server/services/search-orchestrator/mysql-fallback.ts",
        "server/services/unspsc/parser.ts",
        "server/services/unspsc/tree-cache.ts",
        "server/services/unspsc/interest.ts",
        // ── notice-search 子模块 ──
        "server/services/notice-search/agencies/translate.ts",
        "server/services/notice-search/agencies/cache.ts",
        "server/services/notice-search/countries.ts",
        "server/services/notice-search/stats.ts",
        "server/services/notice-search/cache.ts",
        // ── search-orchestrator 子模块 ──
        "server/services/search-orchestrator/format.ts",
        "server/services/search-orchestrator/mode-resolver.ts",
        "server/services/search-orchestrator/detail-fetch.ts",
        // ── translation 子模块 ──
        "server/services/translation/fetchWithTimeout.ts",
        "server/services/translation/chain.ts",
        "server/services/translation/retry.ts",
        "server/services/translation/auto.ts",
        "server/services/translation/notice.ts",
        "server/services/translation/logCleanup.ts",
        // ── notices ──
        "server/services/notices/featured.ts",
        // ── industry-profile ──
        "server/services/industry-profile/resolve.ts",
        // ── 以下为 DB 重度依赖/外部服务，排除出覆盖率统计 ──
        // server/services/recommend/index.ts (推荐编排，DB)
        // server/services/search-orchestrator/* (搜索编排，DB/Meilisearch)
        // server/services/notice-actions.ts (解锁事务，DB)
        // server/services/reportCacheCleanup.ts (定时调度)
        // server/services/sms.ts (外部 SMS API)
        // server/middleware/csrf.ts, rateLimiter.ts (Express 中间件)
        "server/services/unspsc/filter.ts",
        // ── server/services — 独立服务文件 ──
        "server/services/auth.ts",
        "server/services/email.ts",
        "server/services/jwt.ts",
        "server/services/leads.ts",
        "server/services/membership-status.ts",
        "server/services/membership-upgrade.ts",
        "server/services/suppliers.ts",
        "server/services/paymentHistory.ts",
        "server/services/agencyAliasSeed.ts",
        "server/services/training-payment.ts",
        "server/services/notice-actions.ts",
        // ── meilisearch ──
        "server/services/meilisearch/segmentZh.ts",
        // ── search-sync ──
        "server/services/search-sync/wide-row-builder.ts",
        "server/services/search-sync/sync-queue.ts",
        "server/services/search-sync/sync-retry-queue.ts",
        "server/services/search-sync/sync-scheduler.ts",
        "server/services/search-sync/meili-index-sync.ts",
        // ── data-cleanup ──
        "server/services/data-cleanup/engine.ts",
        "server/services/data-cleanup/bridge-cleanup.ts",
        "server/services/data-cleanup/data-cleanup.ts",
        // ── bridge-sync ──
        "server/services/bridge-sync/full-sync.ts",
        // ── quality-monitor ──
        "server/services/quality-monitor/snapshot.ts",
        // ── server/middleware ──
        "server/middleware/auth.ts",
        "server/middleware/errorHandler.ts",
        "server/middleware/csrf.ts",
        "server/middleware/rateLimiter.ts",
        // ── server/payment ──
        "server/payment/keys.ts",
        "server/payment/MockProvider.ts",
        "server/payment/PaymentService.ts",
        "server/payment/AlipayProvider.ts",
        "server/payment/WechatProvider.ts",
        "server/payment/qr.ts",
        "server/payment/fulfillment.ts",
        // ── server/routes ──
        "server/routes/system.routes.ts",
        "server/routes/admin/middleware.ts",
        "server/routes/admin/index.ts",
        "server/routes/admin/metrics.routes.ts",
        "server/routes/admin/quality.routes.ts",
        "server/routes/admin/data-ops.routes.ts",
        "server/routes/admin/translation.routes.ts",
        "server/routes/admin/user-mgmt.routes.ts",
        "server/routes/auth.routes.ts",
        "server/routes/auth/login.routes.ts",
        "server/routes/auth/register.routes.ts",
        "server/routes/auth/password.routes.ts",
        "server/routes/auth/phone.routes.ts",
        "server/routes/notices.routes.ts",
        "server/routes/notices/search.routes.ts",
        "server/routes/notices/detail.routes.ts",
        "server/routes/notices/actions.routes.ts",
        "server/routes/notices/report.routes.ts",
        "server/routes/suppliers.routes.ts",
        "server/routes/suppliers/index.ts",
        "server/routes/suppliers/list.ts",
        "server/routes/suppliers/register.ts",
        "server/routes/suppliers/contact.ts",
        "server/routes/leads.routes.ts",
        "server/routes/membership.routes.ts",
        "server/routes/payment.routes.ts",
        "server/routes/catalog.routes.ts",
        "server/routes/opportunities.routes.ts",
        "server/routes/training.routes.ts",
        "server/routes/user-prefs.routes.ts",
        "server/routes/ai.routes.ts",
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
        "src/features/procurement/api/membership.ts",
        "src/features/procurement/hooks/search/useSearchQuery.ts",
        "src/features/procurement/hooks/search/useSearchFormState.ts",
        "src/features/training/hooks/useTrainingModals.ts",
        "src/features/membership/hooks/useMembershipTier.ts",
        // ── src/shared — 纯逻辑 + 组件 ──
        "src/shared/auth/**/*.ts",
        "src/shared/data/**/*.ts",
        // ── src/shared/ui — React 组件 ──
        "src/shared/ui/**/*.{ts,tsx}",
        // ── src/shared/layout — React 组件 ──
        "src/shared/layout/**/*.{ts,tsx}",
        // ── src/shared/filters — React 组件 ──
        "src/shared/filters/**/*.{ts,tsx}",
        // ── src/features — Phase 4 组件 ──
        "src/features/training/components/*.tsx",
        "src/features/services/components/*.tsx",
        "src/features/procurement/components/*.tsx",
        "src/features/showroom/components/*.tsx",
        "src/features/supplier/components/*.tsx",
        "src/features/membership/components/*.tsx",
        "src/features/payment/components/*.tsx",
        "src/features/auth/components/*.tsx",
        "src/features/auth/components/forms/*.tsx",
        "src/features/crm/components/*.tsx",
      ],
      exclude: [
        "src/__tests__/**",
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "server/**/*.test.ts",
        "server/db/**",
        "server/lifecycle/**",
        "server/bootstrap.ts",
        "server/context.ts",
        "server.ts",
        "server/app.ts",
        "src/App.tsx",
        "src/routes.tsx",
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
