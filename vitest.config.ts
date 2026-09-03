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
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**", "tests/e2e-frontend/**", "tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // ── 覆盖率统计范围：仅纳入已有测试覆盖的文件 ──
      // 新增文件须同步编写测试后再加入此列表；
      // DB 重度依赖 / 外部 SDK / React hooks 需 App 上下文等不可测模块由集成/E2E 测试覆盖。
      include: [
        // ── src/lib/utils — 纯工具函数（全部有测试）──
        "src/lib/utils/mask.ts",
        "src/lib/utils/passwordPolicy.ts",
        "src/lib/utils/json.ts",
        "src/lib/utils/normalize.ts",
        "src/lib/utils/notice-expired.ts",
        "src/lib/utils/ip.ts",
        "src/lib/utils/fileSniff.ts",

        // ── src/lib/validators — 客服输入校验 ──
        "src/lib/validators/chat.ts",

        // ── src/lib/services/recommend — 纯逻辑子模块 ──
        "src/lib/services/recommend/ab-testing.ts",
        "src/lib/services/recommend/recall.ts",
        "src/lib/services/recommend/rerank.ts",
        "src/lib/services/recommend/scoring.ts",
        "src/lib/services/recommend/text-similarity.ts",

        // ── src/lib/services/search-orchestrator — 纯逻辑子模块 ──
        "src/lib/services/search-orchestrator/metrics.ts",
        "src/lib/services/search-orchestrator/params.ts",
        "src/lib/services/search-orchestrator/format.ts",
        "src/lib/services/search-orchestrator/rebuild-trigger.ts",

        // ── src/lib/services/unspsc — 纯函数 ──
        "src/lib/services/unspsc/parser.ts",

        // ── src/lib/services/notice-search — 缓存/统计/翻译 ──
        "src/lib/services/notice-search/agencies/translate.ts",
        "src/lib/services/notice-search/cache.ts",
        "src/lib/services/notice-search/stats.ts",

        // ── src/lib/services/translation — 超时守护 ──
        "src/lib/services/translation/fetchWithTimeout.ts",

        // ── src/lib/services — 独立服务文件（有测试）──
        "src/lib/services/auth.ts",
        "src/lib/services/jwt.ts",
        "src/lib/services/membership-status.ts",
        "src/lib/services/membership-upgrade.ts",
        "src/lib/services/chatTicket.ts",

        // ── src/lib/services/amount — 金额解析 ──
        "src/lib/services/amount/parser.ts",

        // ── src/lib/services/bid-report — 报告构件/合并/预览 ──
        "src/lib/services/bid-report/constants.ts",
        "src/lib/services/bid-report/merge.ts",
        "src/lib/services/bid-report/preview.ts",

        // ── src/lib/services/meilisearch — 中文分词 ──
        "src/lib/services/meilisearch/segmentZh.ts",

        // ── src/lib/payment — 密钥校验 + Mock 策略 + 钱路核心 ──
        "src/lib/payment/keys.ts",
        "src/lib/payment/MockProvider.ts",
        "src/lib/payment/PaymentService.ts",
        "src/lib/payment/fulfillment.ts",
        "src/lib/services/opportunity-unlock.ts",
        "src/lib/repos/payments.repo.ts",

        // ── src/core — 纯逻辑模块（有测试）──
        "src/core/events/events.ts",
        "src/core/http/buildQuery.ts",
        "src/core/i18n/detectScript.ts",
        "src/core/i18n/pickLocale.ts",
        "src/core/payment/env-detector.ts",

        // ── src/features/procurement — 纯逻辑/工具（有测试）──
        "src/features/procurement/notice-type.ts",
        "src/features/procurement/hooks/searchFormReducer.ts",
        "src/features/procurement/hooks/search/useSearchFormState.ts",

        // ── src/features/training — 组件（有测试）──
        "src/features/training/components/TrainingPaymentModal.tsx",

        // ── src/shared — 纯逻辑 + 组件（有测试）──
        "src/shared/auth/**/*.ts",
        "src/shared/utils/cn.ts",
        "src/shared/ui/Button.tsx",
        "src/shared/ui/Badge.tsx",
        "src/shared/ui/Input.tsx",
        "src/shared/ui/EmptyState.tsx",
        "src/shared/ui/SelectableCard.tsx",
        "src/shared/ui/Spinner.tsx",
        "src/shared/ui/Pagination.tsx",
        "src/shared/ui/ErrorBoundary.tsx",

        // ── 以下文件已纳入但暂无测试，待后续补充 ──
        // 静态数据 / barrel re-export / 简单常量：低复杂度，测试 ROI 低
        // "src/lib/data/countryNames.ts",       // 200+ 行静态映射表
        // "src/shared/data/**/*.ts",            // 静态选项数据
        // "src/shared/layout/nav-tabs.ts",      // 简单常量
        // "src/features/procurement/constants.ts", // 常量
        // "src/lib/config/env.ts",              // 环境变量读取
      ],
      exclude: [
        "src/__tests__/**",
        "src/**/*.d.ts",
        "tests/unit/**/*.test.{ts,tsx}",
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
