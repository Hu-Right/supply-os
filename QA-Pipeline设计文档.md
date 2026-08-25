# Supply-OS 端到端质量保障体系（QA Pipeline）

> **版本**: 1.0 | **日期**: 2026-08-25 | **适用项目**: supply-os（国际采购供应链平台）

---

## 总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QA Pipeline 全景图                                   │
│                                                                             │
│  Pre-commit          Pre-merge (PR)           Post-deploy                   │
│  ┌──────────┐       ┌──────────────────┐     ┌──────────────────────┐      │
│  │ ESLint   │       │ 单元测试 (vitest) │     │ E2E (Playwright)     │      │
│  │ Prettier │  ──▶  │ API集成 (supertest)│ ──▶ │ 性能基线检查          │      │
│  │ tsc      │       │ 覆盖率门禁 ≥90%   │     │ 监控告警激活          │      │
│  └──────────┘       └──────────────────┘     └──────────────────────┘      │
│                                                                             │
│  覆盖率贡献: 静态分析    覆盖率贡献: ~93%      覆盖率贡献: 合并 → ≥95%       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 目标矩阵

| 测试层级 | 框架 | 覆盖率目标 | 通过率目标 | 执行时机 | 预估耗时 |
|---------|------|-----------|-----------|---------|---------|
| 单元测试 | vitest + @testing-library/react | ≥ 90% | 100% | Pre-merge | < 180s |
| API 集成测试 | supertest | ≥ 90% | 100% | Pre-merge | < 120s |
| E2E 测试 | @playwright/test | ≥ 90% | 100% | Post-merge / Nightly | < 300s |
| **合并覆盖率** | istanbul-merge | **≥ 95%** | **100%** | CI 流水线 | — |

### 技术栈

| 组件 | 工具 | 状态 |
|------|------|------|
| 单元测试 | vitest + v8 coverage + jsdom | ✅ 已有（需扩展） |
| 组件测试 | @testing-library/react | ✅ 已有 |
| API 集成测试 | **supertest** | 🆕 新增 |
| E2E 测试 | **@playwright/test** | 🆕 新增 |
| 覆盖率合并 | **istanbul-merge** | 🆕 新增 |
| 安全扫描 | **npm audit + audit-ci** | 🆕 新增 |
| 性能监控 | 已有 `src/core/perf/*` | ✅ 已有（需扩展） |
| 结构化日志 | 已有 `server/utils/fileLogger.ts` | ✅ 已有（需升级） |

---

## 第一部分：单元测试（Unit Test）— 覆盖率 ≥ 90%

### 1.1 现有基础

- **31 个测试文件**，354 个用例，通过率 100%
- 语句覆盖率 ~6.27%（786/12,539 行）
- 覆盖范围：`server/utils`（76%）、`src/core`（43.8%）、`src/shared`（9.9%）
- 未覆盖：`server/services`（1.2%）、`server/routes`（0%）、`server/repos`（0%）

### 1.2 覆盖率排除策略

以下文件从分母中排除（不可测/无意义），修改 `vitest.config.ts`：

```typescript
// vitest.config.ts — coverage.exclude 新增项
coverage: {
  exclude: [
    // ── 已有排除（保持不变）──
    "src/__tests__/**", "src/**/*.d.ts", "src/**/*.test.{ts,tsx}",
    "src/**/index.ts", "src/types/**", "src/data/**", "src/payment/**",
    "src/main.tsx",
    // 各 feature 内的 types/data/api 文件...
    "server/**/*.test.ts", "server/db/schema.ts",

    // ── 新增排除 ──
    "server/db/migrations/**",        // 数据库迁移脚本（~515 行）
    "server/db/pool.ts",              // 连接池创建（依赖运行时环境）
    "server/db/backfills.ts",         // 数据回填（依赖 DB）
    "server/db/seeds.ts",             // 种子数据（依赖 DB）
    "server/db/seeds/**",             // 种子数据目录
    "server/services/agency-i18n/**", // i18n 静态数据（~156 行）
    "server/lifecycle/**",            // 启动生命周期（依赖完整运行时）
    "server/config/env.ts",           // 环境变量配置
    "server/bootstrap.ts",            // 服务启动入口
    "server/context.ts",              // 纯类型定义
    "server.ts",                      // 进程入口
    "src/App.tsx",                    // 根组件挂载
    "src/routes.tsx",                 // 路由配置（纯 JSX 声明）
    "src/vite-env.d.ts",             // Vite 类型声明
  ],
}
```

排除后有效分母：~11,000 行 → 90% 需覆盖 ~9,900 行

### 1.3 Mock 策略矩阵

| 被测层 | Mock 对象 | Mock 方式 | 说明 |
|--------|----------|----------|------|
| `server/utils` | 无外部依赖 | 直接测试 | 纯函数，零 Mock |
| `server/services` | `pool.query` | `vi.mock('../db/pool')` | 模拟 SQL 返回 |
| `server/repos` | `pool.query` | `vi.mock('../db/pool')` | 验证 SQL 构建 |
| `server/routes` | Repo 实例 | `vi.mock('../repos/...')` | 验证请求/响应 |
| `server/payment` | 支付网关 SDK | `vi.mock('alipay-sdk')` | 模拟支付流程 |
| `server/middleware` | Express req/res | 手动构造 Mock | 验证中间件逻辑 |
| `src/core/hooks` | fetch / API | `vi.spyOn(globalThis, 'fetch')` | 模拟 HTTP 响应 |
| `src/features/*` | API 层 | `vi.mock('../api')` | 隔离 UI 与数据 |
| `src/shared/*` | React context | `renderHook` + wrapper | 测试 Hook 逻辑 |

### 1.4 后端单元测试计划

#### B1: server/utils 补全（~60 行待覆盖）

| 测试文件 | 被测文件 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/utils/countryNormalize.extra.test.ts` | `countryNormalize.ts` | 5 | 边界国家名/大小写/空值 |
| `tests/server/utils/normalize.extra.test.ts` | `normalize.ts` | 8 | Unicode/全角/特殊字符 |
| `tests/server/utils/mask.extra.test.ts` | `mask.ts` | 6 | 邮箱/手机/ID 脱敏边界 |
| `tests/server/utils/passwordPolicy.extra.test.ts` | `passwordPolicy.ts` | 5 | 密码策略边界值 |

#### B2: server/services 独立文件（~900 行）

| 测试文件 | 被测文件 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/services/auth.extra.test.ts` | `auth.ts` | 12 | 密码哈希/Token 生成/验证 |
| `tests/server/services/jwt.extra.test.ts` | `jwt.ts` | 10 | 签发/验证/过期/刷新 |
| `tests/server/services/email.test.ts` | `email.ts` | 8 | 模板渲染/发送/失败重试 |
| `tests/server/services/sms.test.ts` | `sms.ts` | 8 | 短信发送/模板/限流 |
| `tests/server/services/leads.test.ts` | `leads.ts` | 10 | 线索创建/分配/状态流转 |
| `tests/server/services/suppliers.test.ts` | `suppliers.ts` | 12 | 供应商 CRUD/搜索/状态 |
| `tests/server/services/membership-upgrade.test.ts` | `membership-upgrade.ts` | 10 | 升级计算/支付联动 |
| `tests/server/services/paymentHistory.test.ts` | `paymentHistory.ts` | 8 | 支付记录查询/分页 |
| `tests/server/services/notice-actions.test.ts` | `notice-actions.ts` | 10 | 公告操作/收藏/互动 |
| `tests/server/services/reportCacheCleanup.test.ts` | `reportCacheCleanup.ts` | 6 | 缓存清理策略 |
| `tests/server/services/agencyAliasSeed.test.ts` | `agencyAliasSeed.ts` | 6 | 别名种子写入 |
| `tests/server/services/agency-alias-data.test.ts` | `agency-alias-data.ts` | 5 | 别名数据映射 |

#### B3: server/services 算法子模块（~1,200 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/services/recommend/*.test.ts` | `recommend/` (8 文件) | 30 | 推荐算法/评分/排序 |
| `tests/server/services/industry-match/*.test.ts` | `industry-match/` | 15 | 行业匹配/ UNSPSC 映射 |
| `tests/server/services/unspsc/*.test.ts` | `unspsc/` (5 文件) | 20 | 分类查询/层级/搜索 |
| `tests/server/services/amount/*.test.ts` | `amount/` (4 文件) | 15 | 金额计算/币种/格式化 |
| `tests/server/services/quality-monitor/*.test.ts` | `quality-monitor/` | 10 | 质量监控/阈值/告警 |

#### B4: server/services 搜索/翻译/大数据（~2,500 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/services/search-orchestrator/*.test.ts` | `search-orchestrator/` (12 文件) | 45 | 搜索编排/降级/分页 |
| `tests/server/services/notice-search/*.test.ts` | `notice-search/` (6 文件) | 25 | 搜索查询/过滤/统计 |
| `tests/server/services/meilisearch/*.test.ts` | `meilisearch/` (5 文件) | 20 | 索引/同步/健康检查 |
| `tests/server/services/search-sync/*.test.ts` | `search-sync/` (5 文件) | 20 | 增量同步/重试/宽表 |
| `tests/server/services/translation/*.test.ts` | `translation/` (7 文件) | 30 | 翻译调用/缓存/预算 |
| `tests/server/services/data-cleanup/*.test.ts` | `data-cleanup/` (4 文件) | 15 | 数据清理/过期/级联 |
| `tests/server/services/bid-report/*.test.ts` | `bid-report/` (6 文件) | 20 | 报告生成/缓存/导出 |
| `tests/server/services/notices/*.test.ts` | `notices/` (2 文件) | 10 | 精选/特征刷新 |
| `tests/server/services/bridge-sync/*.test.ts` | `bridge-sync/` (2 文件) | 8 | 桥接同步/冲突 |

#### B5: server/repos 数据层（~440 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/repos/users.test.ts` | `users.repo.ts` | 10 | 用户 CRUD/查询 |
| `tests/server/repos/membership.test.ts` | `membership.repo.ts` | 8 | 会员状态/升级 |
| `tests/server/repos/payments.test.ts` | `payments.repo.ts` | 8 | 支付记录/查询 |
| `tests/server/repos/catalog.test.ts` | `catalog.repo.ts` | 6 | 目录查询/UNSPSC |
| `tests/server/repos/leads.test.ts` | `leads.repo.ts` | 8 | 线索 CRUD |
| `tests/server/repos/opportunities.test.ts` | `opportunities.repo.ts` | 8 | 商机 CRUD |
| `tests/server/repos/training.test.ts` | `training.repo.ts` | 8 | 培训 CRUD |
| `tests/server/repos/user-prefs.test.ts` | `user-prefs.repo.ts` | 6 | 偏好设置 |
| `tests/server/repos/admin.test.ts` | `admin.repo.ts` | 8 | 管理查询 |
| `tests/server/repos/notices/*.test.ts` | `notices/` (6 文件) | 30 | 公告各子 Repo |
| `tests/server/repos/suppliers/*.test.ts` | `suppliers/` (4 文件) | 20 | 供应商各子 Repo |

#### B6: server/routes 路由层（~1,440 行）

| 测试文件 | 被测路由 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/routes/auth/*.test.ts` | `auth/` (4 文件) | 30 | 登录/注册/密码/手机 |
| `tests/server/routes/notices/*.test.ts` | `notices/` (5 文件) | 25 | 搜索/详情/操作/报告 |
| `tests/server/routes/suppliers/*.test.ts` | `suppliers/` (4 文件) | 20 | 列表/注册/联系 |
| `tests/server/routes/admin/*.test.ts` | `admin/` (7 文件) | 30 | 管理各端点 |
| `tests/server/routes/leads.test.ts` | `leads.routes.ts` | 8 | 线索 API |
| `tests/server/routes/membership.test.ts` | `membership.routes.ts` | 6 | 会员 API |
| `tests/server/routes/payment.test.ts` | `payment.routes.ts` | 15 | 支付 API |
| `tests/server/routes/catalog.test.ts` | `catalog.routes.ts` | 8 | 目录 API |
| `tests/server/routes/opportunities.test.ts` | `opportunities.routes.ts` | 8 | 商机 API |
| `tests/server/routes/training.test.ts` | `training.routes.ts` | 12 | 培训 API |
| `tests/server/routes/user-prefs.test.ts` | `user-prefs.routes.ts` | 5 | 偏好 API |
| `tests/server/routes/system.test.ts` | `system.routes.ts` | 5 | 系统 API |
| `tests/server/routes/ai.test.ts` | `ai.routes.ts` | 6 | AI 匹配 API |

#### B7: server/payment + middleware（~430 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/payment/PaymentService.test.ts` | `PaymentService.ts` | 15 | 订单创建/回调/退款 |
| `tests/server/payment/MockProvider.test.ts` | `MockProvider.ts` | 8 | Mock 支付流程 |
| `tests/server/payment/AlipayProvider.test.ts` | `AlipayProvider.ts` | 10 | 支付宝接口 |
| `tests/server/payment/WechatProvider.test.ts` | `WechatProvider.ts` | 10 | 微信支付接口 |
| `tests/server/payment/fulfillment.test.ts` | `fulfillment.ts` | 8 | 履约逻辑 |
| `tests/server/middleware/auth.test.ts` | `auth.ts` | 10 | JWT 提取/验证 |
| `tests/server/middleware/authLegacyMetrics.test.ts` | `authLegacyMetrics.ts` | 6 | 旧指标兼容 |
| `tests/server/middleware/csrf.test.ts` | `csrf.ts` | 8 | CSRF 防护 |
| `tests/server/middleware/errorHandler.test.ts` | `errorHandler.ts` | 8 | 错误处理/404 |
| `tests/server/middleware/rateLimiter.test.ts` | `rateLimiter.ts` | 12 | 限流/窗口/持久化 |

#### B8: server/data（~150 行）

| 测试文件 | 被测文件 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/server/data/countryNames.extra.test.ts` | `countryNames.ts` | 5 | 国家名映射边界 |
| `tests/server/services/agency-i18n-data.test.ts` | `agency-i18n-data.ts` | 5 | 机构国际化数据 |

### 1.5 前端单元测试计划

#### C1: src/core 补全至 95%（~330 行待覆盖）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/src/core/auth/*.test.ts` | `auth/` (3 文件) | 15 | Token 管理/刷新/存储 |
| `tests/src/core/http/*.test.ts` | `http/` (4 文件) | 12 | fetch 封装/错误/拦截器 |
| `tests/src/core/pic/*.test.ts` | `pic/` (3 文件) | 10 | 图片处理/压缩/预览 |
| `tests/src/core/i18n/*.extra.test.ts` | `i18n/` (9 文件) | 10 | 补充边界用例 |
| `tests/src/core/unspsc/*.extra.test.ts` | `unspsc/` (4 文件) | 8 | 补充边界用例 |

#### C2: src/features hooks/utils（~1,500 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/src/features/procurement/**/*.test.ts` | procurement hooks/utils | 35 | 搜索/筛选/详情/报告 |
| `tests/src/features/membership/**/*.test.ts` | membership hooks/utils | 20 | 方案计算/升级/支付 |
| `tests/src/features/crm/**/*.test.ts` | crm hooks/utils | 20 | 看板/线索/跟进 |
| `tests/src/features/showroom/**/*.test.ts` | showroom hooks/utils | 15 | 供应商展示/搜索 |
| `tests/src/features/supplier/**/*.test.ts` | supplier hooks/utils | 15 | 注册/联系/声明 |
| `tests/src/features/training/**/*.test.ts` | training hooks/utils | 15 | 报名/支付/下载 |
| `tests/src/features/services/**/*.test.ts` | services hooks/utils | 10 | 服务展示 |
| `tests/src/features/learning/**/*.test.ts` | learning hooks/utils | 10 | 资料/FAQ |
| `tests/src/features/payment/**/*.test.ts` | payment hooks/utils | 12 | 支付流程 |
| `tests/src/features/auth/**/*.test.ts` | auth hooks/utils | 12 | 登录/注册/密码 |

#### C3: src/features React 组件（~1,800 行）

| 测试文件 | 被测组件 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/src/features/procurement/**/*.component.test.tsx` | 采购页面组件 | 25 | 渲染/交互/状态 |
| `tests/src/features/membership/**/*.component.test.tsx` | 会员页面组件 | 15 | 方案对比/升级表单 |
| `tests/src/features/crm/**/*.component.test.tsx` | CRM 组件 | 15 | 看板拖拽/表单 |
| `tests/src/features/showroom/**/*.component.test.tsx` | 展厅组件 | 12 | 供应商卡片/搜索 |
| `tests/src/features/supplier/**/*.component.test.tsx` | 供应商组件 | 10 | 注册表单/列表 |
| `tests/src/features/training/**/*.component.test.tsx` | 培训组件 | 10 | 课程列表/报名 |
| `tests/src/features/services/**/*.component.test.tsx` | 服务组件 | 8 | 服务展示 |
| `tests/src/features/learning/**/*.component.test.tsx` | 学习组件 | 8 | 资料列表/FAQ |
| `tests/src/features/payment/**/*.component.test.tsx` | 支付组件 | 10 | 支付表单/状态 |
| `tests/src/features/auth/**/*.component.test.tsx` | 认证组件 | 10 | 登录/注册表单 |

#### C4: src/shared 全部（~530 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/src/shared/ui/*.extra.test.tsx` | UI 组件库 (14 文件) | 30 | 补全 Spinner/Button/Modal 等 |
| `tests/src/shared/layout/*.test.tsx` | Layout 组件 (12 文件) | 20 | Header/TabNav/ProtectedRoute |
| `tests/src/shared/filters/*.test.ts` | 过滤器 (7 文件) | 15 | 筛选逻辑/格式化 |
| `tests/src/shared/forms/*.test.tsx` | 表单组件 (4 文件) | 12 | 验证/提交/错误 |

#### C5: src 其余（~100 行）

| 测试文件 | 被测模块 | 用例数 | 关键场景 |
|----------|---------|--------|---------|
| `tests/src/types/*.test.ts` | 类型工具函数 | 5 | 运行时类型守卫 |

### 1.6 单元测试汇总

| 分类 | 新增测试文件 | 新增用例数 | 覆盖行数 |
|------|------------|----------|---------|
| 后端 utils 补全 | 4 | 24 | ~60 |
| 后端 services | 12 + 16 + 45 = 73 | ~300 | ~4,100 |
| 后端 repos | 18 | ~120 | ~440 |
| 后端 routes | 26 | ~200 | ~1,440 |
| 后端 payment + middleware | 10 | ~90 | ~430 |
| 后端 data | 2 | 10 | ~150 |
| 前端 core 补全 | 8 | ~55 | ~330 |
| 前端 features hooks | 30 | ~174 | ~1,500 |
| 前端 features 组件 | 30 | ~140 | ~1,800 |
| 前端 shared | 15 | ~77 | ~530 |
| 前端其余 | 3 | ~5 | ~100 |
| **合计** | **~219** | **~1,195** | **~10,880** |

预计单元测试覆盖率：~10,880 / 11,000 ≈ **99%**（含冗余覆盖）

---

## 第二部分：API 集成测试（Integration Test）— 覆盖率 ≥ 90%

### 2.1 架构设计

```
┌──────────────────────────────────────────────────┐
│                  集成测试架构                       │
│                                                    │
│  supertest ──▶ Express App (createApp)             │
│                  │                                 │
│                  ├── Mock DB Pool (mysql2)         │
│                  ├── Mock PaymentService           │
│                  ├── Mock Meilisearch              │
│                  └── Mock External APIs            │
│                                                    │
│  测试范围: 路由 → 中间件 → Repo → (Mock) DB        │
└──────────────────────────────────────────────────┘
```

### 2.2 基础设施

**新增依赖**: `supertest` + `@types/supertest`

**测试辅助模块** `tests/integration/helpers.ts`:

```typescript
// tests/integration/helpers.ts
import supertest from "supertest";
import { createApp } from "../../server/app";
import type { AppContext } from "../../server/context";

/**
 * 创建带 Mock 依赖的测试 App 实例
 * 所有 Repo 层使用 vi.mock 注入，不连接真实数据库
 */
export function createTestApp(overrides?: Partial<AppContext>) {
  const mockPool = {
    query: vi.fn(),
    execute: vi.fn(),
    end: vi.fn(),
    // ... 其他 Pool 方法 Mock
  };
  const ctx = createMockContext(mockPool, overrides);
  const app = createApp(ctx);
  return { app: supertest(app), ctx, mockPool };
}

/** 构造带 JWT Token 的认证请求 */
export function authRequest(app: supertest.SuperTest<supertest.Test>, token: string) {
  return app.set("Authorization", `Bearer ${token}`);
}
```

### 2.3 API 集成测试矩阵

#### 认证域 `/api/auth/*`（4 路由文件, ~772 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/auth/login.test.ts` | POST /api/auth/login | 10 | 正常登录/错误密码/锁定/速率限制 |
| `tests/integration/auth/register.test.ts` | POST /api/auth/register | 10 | 正常注册/重复邮箱/密码策略 |
| `tests/integration/auth/password.test.ts` | POST /api/auth/password/* | 12 | 重置请求/Token 验证/新密码设置 |
| `tests/integration/auth/phone.test.ts` | POST /api/auth/phone/* | 10 | 绑定/验证码/换绑/解绑 |

#### 公告域 `/api/notices/*`（5 路由文件, ~692 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/notices/search.test.ts` | GET /api/notices/search | 10 | 关键词/分页/筛选/排序 |
| `tests/integration/notices/detail.test.ts` | GET /api/notices/:id | 8 | 详情/翻译/不存在 |
| `tests/integration/notices/actions.test.ts` | POST /api/notices/:id/* | 10 | 解锁/收藏/互动 |
| `tests/integration/notices/report.test.ts` | GET /api/notices/:id/report | 8 | 报告生成/缓存/权限 |
| `tests/integration/notices/feedback.test.ts` | POST /api/notices/:id/feedback | 6 | 反馈提交/验证 |

#### 支付域 `/api/billing/*` `/api/payment/*`（1 路由文件, ~252 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/payment/create-order.test.ts` | POST /api/billing/create-order | 8 | 下单/金额验证/库存 |
| `tests/integration/payment/callback.test.ts` | POST /api/payment/alipay/notify | 8 | 回调签名/状态更新 |
| `tests/integration/payment/history.test.ts` | GET /api/payments/history | 6 | 历史查询/分页/权限 |

#### 供应商域 `/api/suppliers/*`（4 路由文件, ~393 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/suppliers/list.test.ts` | GET /api/suppliers | 8 | 列表/搜索/分页/筛选 |
| `tests/integration/suppliers/register.test.ts` | POST /api/suppliers/register | 10 | 注册/验证/重复 |
| `tests/integration/suppliers/contact.test.ts` | POST /api/suppliers/:id/contact | 6 | 联系信息/权限 |
| `tests/integration/suppliers/claim.test.ts` | POST /api/supplier-claims | 8 | 认领/验证/冲突 |

#### 会员域 `/api/membership/*`（1 路由文件, ~64 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/membership/status.test.ts` | GET /api/membership/status | 6 | 状态查询/等级/过期 |
| `tests/integration/membership/upgrade.test.ts` | POST /api/membership/upgrade | 6 | 升级/降级/价格 |

#### 培训域 `/api/training/*`（1 路由文件, ~364 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/training/list.test.ts` | GET /api/training/courses | 8 | 课程列表/筛选 |
| `tests/integration/training/register.test.ts` | POST /api/training/register | 8 | 报名/名额/重复 |
| `tests/integration/training/download.test.ts` | GET /api/training/materials/:id | 6 | 下载/权限/不存在 |

#### 其他域

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/leads.test.ts` | /api/leads/* | 8 | 线索 CRUD |
| `tests/integration/opportunities.test.ts` | /api/opportunities/* | 8 | 商机 CRUD/匹配 |
| `tests/integration/catalog.test.ts` | /api/certifications, /api/unspsc/* | 6 | 目录/UNSPSC 查询 |
| `tests/integration/user-prefs.test.ts` | /api/user/industry-prefs | 5 | 偏好设置/读取 |
| `tests/integration/ai.test.ts` | /api/ai/matchmake | 6 | AI 匹配请求/响应 |
| `tests/integration/system.test.ts` | /api/system/* | 5 | 健康检查/状态 |

#### 管理域 `/api/admin/*`（7 路由文件, ~406 行）

| 测试文件 | 端点 | 用例数 | 关键场景 |
|----------|------|--------|---------|
| `tests/integration/admin/metrics.test.ts` | /api/admin/metrics | 6 | 指标查询/权限 |
| `tests/integration/admin/quality.test.ts` | /api/admin/quality/* | 8 | 质量监控/阈值 |
| `tests/integration/admin/translation.test.ts` | /api/admin/translation/* | 8 | 翻译管理/触发 |
| `tests/integration/admin/data-ops.test.ts` | /api/admin/data-ops/* | 6 | 数据运维/清理 |
| `tests/integration/admin/user-mgmt.test.ts` | /api/admin/users/* | 8 | 用户管理/角色 |

### 2.4 集成测试数据库策略

```
方案: Mock Pool + 事务模拟

┌────────────────────────────────────────────────┐
│  每个测试文件:                                   │
│                                                  │
│  beforeEach:                                     │
│    - vi.restoreAllMocks()                        │
│    - 重置 Mock Pool 的 query 返回值               │
│                                                  │
│  每个测试用例:                                    │
│    - Mock pool.query 返回预设数据                  │
│    - 验证 SQL 语句结构（参数化查询）                │
│    - 验证响应状态码 + 响应体结构                    │
│                                                  │
│  优势: 零数据库依赖，CI 无需 MySQL 实例             │
│  补充: E2E 层使用真实测试数据库覆盖全链路            │
└────────────────────────────────────────────────┘
```

### 2.5 集成测试汇总

| 域 | 测试文件数 | 用例数 | 覆盖路由行数 |
|----|----------|--------|------------|
| 认证 | 4 | 42 | ~772 |
| 公告 | 5 | 42 | ~692 |
| 支付 | 3 | 22 | ~252 |
| 供应商 | 4 | 32 | ~393 |
| 会员 | 2 | 12 | ~64 |
| 培训 | 3 | 22 | ~364 |
| 其他 | 6 | 36 | ~450 |
| 管理 | 5 | 36 | ~406 |
| **合计** | **32** | **~244** | **~3,393** |

---

## 第三部分：E2E 端到端测试（End-to-End Test）— 覆盖率 ≥ 90%

### 3.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E 测试架构                               │
│                                                               │
│  Playwright ──▶ Chromium/Firefox/WebKit                      │
│       │                                                      │
│       ▼                                                      │
│  Express Server (真实实例, NODE_ENV=test)                      │
│       │                                                      │
│       ├── MySQL Test DB (supply_os_test)                     │
│       ├── Mock Payment Gateway (MockProvider)                │
│       ├── Mock SMS/Email (记录不发送)                         │
│       └── Mock AI/Translation API                            │
│                                                               │
│  覆盖率收集:                                                   │
│    - Server 端: --import @vitest/coverage-v8 (V8 原生)        │
│    - Client 端: Playwright __coverage__ 注入                   │
│    - 合并: istanbul-merge unit + integration + e2e            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 配置文件

**`playwright.config.ts`**:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'NODE_ENV=test npx tsx --import @vitest/coverage-v8 server.ts',
    port: 3001,
    reuseExistingServer: false,
    env: {
      PORT: '3001',
      NODE_ENV: 'test',
      MYSQL_DATABASE: 'supply_os_test',
      PAYMENT_MODE: 'mock',
      MEILI_ENABLED: 'off',
      NOTICE_AUTO_TRANSLATE: 'off',
      SEED_ENABLED: 'on',
    },
  },
});
```

### 3.3 测试数据管理

**`e2e/fixtures/test-data.ts`** — 工厂函数：

```typescript
export const testUser = {
  email: 'test@example.com',
  password: 'Test1234!',
  name: 'Test User',
};

export const testSupplier = {
  companyName: 'Test Supplier Co.',
  country: 'CN',
  industry: 'Manufacturing',
};

export const testNotice = {
  title: 'Test Procurement Notice',
  agency: 'UNDP',
  deadline: '2026-12-31',
};

/** 每个测试前调用：重置测试数据库到已知状态 */
export async function seedTestDb() {
  // 清空 → 种子 → 验证
}
```

### 3.4 用户旅程测试矩阵

#### 旅程 1: 注册 → 登录 → 设置偏好

```
e2e/flows/register-login.spec.ts

Steps:
1. 访问 /showroom
2. 点击注册 → 填写表单 → 提交
3. 验证注册成功提示
4. 登出
5. 登录 → 输入邮箱/密码 → 提交
6. 验证登录状态（导航栏显示用户名）
7. 进入设置 → 选择行业偏好 → 保存
8. 验证偏好已保存
```

#### 旅程 2: 搜索 → 详情 → 解锁 → 下载报告

```
e2e/flows/search-unlock-flow.spec.ts

Steps:
1. 登录（VIP 会员）
2. 进入 /procurement
3. 输入关键词搜索 → 验证搜索结果
4. 点击某条公告 → 进入详情页
5. 点击"解锁" → 确认扣费 → 验证解锁成功
6. 点击"下载报告" → 验证报告生成
7. 验证报告内容包含关键信息
```

#### 旅程 3: 供应商注册 → 审核 → 上架

```
e2e/flows/supplier-register.spec.ts

Steps:
1. 访问 /supplier
2. 点击"供应商注册" → 填写公司信息
3. 上传资质文件（Mock）
4. 提交注册申请
5. 管理员登录 → 进入 /crm
6. 审核通过 → 验证供应商上架
7. 在 /showroom 搜索验证可见
```

#### 旅程 4: 会员升级 → 支付 → 确认

```
e2e/flows/membership-upgrade.spec.ts

Steps:
1. 以普通用户登录
2. 进入 /membership
3. 对比方案 → 选择"年度VIP"
4. 选择支付方式（Mock 支付宝）
5. 完成支付（Mock 回调）
6. 验证会员状态变更为 VIP
7. 验证解锁次数增加
```

#### 旅程 5: 培训报名 → 支付 → 下载

```
e2e/flows/training-enroll.spec.ts

Steps:
1. 登录 → 进入 /training
2. 浏览课程列表 → 选择课程
3. 点击报名 → 确认
4. 完成支付（Mock）
5. 下载培训资料 → 验证文件
6. 验证报名记录
```

#### 旅程 6: CRM 完整工作流

```
e2e/flows/crm-workflow.spec.ts

Steps:
1. 管理员登录 → 进入 /crm
2. 查看线索看板 → 创建新线索
3. 将线索转为商机
4. 填写商机详情 → AI 匹配供应商
5. 查看匹配结果 → 联系供应商
6. 更新商机状态 → 验证流转
```

### 3.5 页面渲染测试

| 测试文件 | 页面 | 验证点 |
|----------|------|--------|
| `e2e/pages/showroom.spec.ts` | /showroom | 渲染/供应商卡片/搜索框/导航 |
| `e2e/pages/procurement.spec.ts` | /procurement | 搜索/筛选面板/结果列表/分页 |
| `e2e/pages/supplier.spec.ts` | /supplier | 目录/注册入口/联系信息 |
| `e2e/pages/crm.spec.ts` | /crm (需登录) | 看板/线索表单/重定向未登录 |
| `e2e/pages/services.spec.ts` | /services | 服务列表/故事展示 |
| `e2e/pages/learning.spec.ts` | /learning | 资料列表/FAQ 折叠 |
| `e2e/pages/membership.spec.ts` | /membership | 方案对比表/升级按钮 |
| `e2e/pages/training.spec.ts` | /training | 课程列表/报名入口 |

### 3.6 API 端点 E2E 验证

> 与集成测试互补：集成测试用 Mock 覆盖所有分支，E2E 用真实服务器验证关键路径。

| 测试文件 | 覆盖端点 | 验证方式 |
|----------|---------|---------|
| `e2e/api/auth.spec.ts` | /api/auth/* | 真实 DB 写入 + JWT 验证 |
| `e2e/api/notices.spec.ts` | /api/notices/* | 搜索降级 + 详情返回 |
| `e2e/api/payment.spec.ts` | /api/billing/* | Mock 支付全链路 |
| `e2e/api/suppliers.spec.ts` | /api/suppliers/* | 注册 + 列表查询 |
| `e2e/api/training.spec.ts` | /api/training/* | 报名 + 下载 |
| `e2e/api/admin.spec.ts` | /api/admin/* | 权限验证 + 数据操作 |
| `e2e/api/system.spec.ts` | /api/system/health | 健康检查响应 |

### 3.7 E2E 覆盖率收集策略

E2E 要达到 90% 覆盖率，需要确保**每个路由的每个分支**至少被一个 E2E 流程触及：

| 策略 | 说明 | 覆盖的分支类型 |
|------|------|-------------|
| 正常路径 | 每个 API 的成功响应 | 主流程 |
| 错误路径 | 400/401/403/404/500 | 错误处理分支 |
| 权限矩阵 | 匿名/普通/VIP/管理员 | 鉴权分支 |
| 边界输入 | 空/超长/非法字符 | 验证分支 |
| 业务状态 | 已解锁/未解锁/过期 | 条件分支 |
| 跨浏览器 | Chromium/Firefox/WebKit | 兼容性 |
| 响应式 | 桌面 + 移动端 | CSS 分支 |

### 3.8 E2E 外部依赖 Mock 策略

| 外部依赖 | E2E 处理方式 | 配置 |
|----------|-------------|------|
| MySQL | 真实测试数据库 `supply_os_test` | `MYSQL_DATABASE=supply_os_test` |
| 支付网关 | MockProvider（已有） | `PAYMENT_MODE=mock` |
| 邮件 SMTP | 记录模式（不发送） | `EMAIL_PROVIDER=mock` |
| 短信 API | 记录模式（不发送） | `SMS_PROVIDER=mock` |
| AI/翻译 API | Mock 响应 | `vi.mock` 或环境变量 |
| Meilisearch | 关闭（降级到 MySQL FULLTEXT） | `MEILI_ENABLED=off` |

### 3.9 E2E 测试汇总

| 分类 | 测试文件数 | 用例数 | 覆盖范围 |
|------|----------|--------|---------|
| 用户旅程 | 6 | ~42 | 6 个完整业务流程 |
| 页面渲染 | 8 | ~40 | 8 个前端路由 100% |
| API E2E | 7 | ~35 | 关键 API 路径 |
| **合计** | **21** | **~117** | 全栈覆盖 |

---

## 第四部分：监控、日志与告警体系（Observability & Alerting）

### 4.1 上线前检查清单

#### 4.1.1 静态检查（Pre-commit / Pre-merge）

```yaml
# 已有配置
- ESLint: npm run lint
- TypeScript: npm run typecheck
- Prettier: npm run format
- 编码检查: npm run check:encoding

# 新增
- 依赖漏洞: npm audit --audit-level=high
- 敏感信息: 检查 .env 不入库（.gitignore 已配置）
- License 合规: npx license-checker --failOn GPL
```

#### 4.1.2 性能基线（基于已有 `src/core/perf/` 模块）

利用现有的 [metrics.ts](file:///c:/Users/28415/Desktop/supply-os/src/core/perf/metrics.ts) 和 [reporter.ts](file:///c:/Users/28415/Desktop/supply-os/src/core/perf/reporter.ts) 建立性能门禁：

| 指标 | 阈值 (Good) | 阈值 (Acceptable) | 阈值 (Poor) |
|------|------------|-------------------|-------------|
| TTFB | < 200ms | < 500ms | ≥ 500ms |
| FCP | < 1.0s | < 1.8s | ≥ 1.8s |
| LCP | < 2.5s | < 4.0s | ≥ 4.0s |
| DOM Interactive | < 2.0s | < 3.5s | ≥ 3.5s |
| API 平均响应 | < 200ms | < 500ms | ≥ 500ms |
| 组件平均渲染 | < 16ms | < 33ms | ≥ 33ms |

**CI 性能测试流程**:

```yaml
# .github/workflows/perf-gate.yml
- name: Performance Budget Check
  run: |
    # 使用 Playwright 采集性能快照
    npx tsx scripts/perf-budget-check.ts
    # 对比阈值，超标则失败
  env:
    PERF_TTFB_BUDGET: 500
    PERF_FCP_BUDGET: 1800
    PERF_LCP_BUDGET: 4000
```

#### 4.1.3 安全扫描

```yaml
# .github/workflows/security.yml
- name: npm audit
  run: npx audit-ci --high

- name: Secret scanning
  run: |
    # 检查代码中是否有硬编码的密钥/Token
    npx gitleaks detect --source . --verbose

- name: Dependency review (PR)
  uses: actions/dependency-review-action@v4
  with:
    fail-on-severity: high
```

### 4.2 上线后监控

#### 4.2.1 结构化日志升级

升级现有 [fileLogger.ts](file:///c:/Users/28415/Desktop/supply-os/server/utils/fileLogger.ts) 为 JSON 结构化格式：

```typescript
// server/utils/structuredLogger.ts（新增）
import { createLogger } from './fileLogger';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: 'supply-os';
  traceId?: string;
  userId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/** 生成唯一请求追踪 ID */
export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Express 请求日志中间件 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const traceId = generateTraceId();
  (req as any).traceId = traceId;
  const start = Date.now();

  res.on('finish', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      message: `${req.method} ${req.path}`,
      service: 'supply-os',
      traceId,
      userId: (req as any).userKey || undefined,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    };
    // 输出 JSON 格式日志（便于 ELK/Loki 解析）
    structuredLog(entry);
  });
  next();
}
```

#### 4.2.2 Prometheus 指标导出

```typescript
// server/middleware/metrics.ts（新增）
import client from 'prom-client';

// 创建 Registry
const register = new client.Registry();

// 默认指标（CPU/内存/事件循环延迟）
client.collectDefaultMetrics({ register });

// 自定义指标
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query duration in ms',
  labelNames: ['operation'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register],
});

const dbPoolActive = new client.Gauge({
  name: 'db_pool_active_connections',
  help: 'Active database pool connections',
  registers: [register],
});

/** Express 指标采集中间件 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpRequestDuration.startTimer({ method: req.method, route: req.route?.path || req.path });
  res.on('finish', () => {
    end({ status_code: res.statusCode });
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode });
  });
  next();
}

/** GET /api/system/metrics — Prometheus 抓取端点 */
export function metricsHandler(_req: Request, res: Response) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}
```

#### 4.2.3 告警规则

| 告警名称 | 条件 | 严重级别 | 通知方式 |
|----------|------|---------|---------|
| 高错误率 | 5xx 错误率 > 5% (5min 窗口) | 🔴 Critical | 钉钉/企业微信 Webhook |
| 慢 API | P95 响应时间 > 2s (5min 窗口) | 🟡 Warning | 钉钉/企业微信 Webhook |
| 数据库连接池耗尽 | 活跃连接 > 80% 池大小 | 🟡 Warning | 钉钉/企业微信 Webhook |
| 内存使用过高 | 进程 RSS > 1GB | 🟡 Warning | 钉钉/企业微信 Webhook |
| 事件循环延迟 | 延迟 > 100ms | 🟡 Warning | 钉钉/企业微信 Webhook |
| 磁盘空间不足 | 日志目录 > 5GB | 🔴 Critical | 钉钉/企业微信 Webhook |
| 证书即将过期 | SSL 证书 < 7 天 | 🟡 Warning | 邮件 |
| 服务不可达 | 健康检查连续 3 次失败 | 🔴 Critical | 钉钉/企业微信 + 电话 |

#### 4.2.4 Grafana 仪表板

```json
{
  "dashboard": {
    "title": "Supply-OS Production",
    "panels": [
      {
        "title": "请求速率 (QPS)",
        "type": "graph",
        "targets": [{ "expr": "rate(http_requests_total[5m])" }]
      },
      {
        "title": "API 响应时间分布",
        "type": "heatmap",
        "targets": [{ "expr": "rate(http_request_duration_ms_bucket[5m])" }]
      },
      {
        "title": "错误率",
        "type": "graph",
        "targets": [{ "expr": "rate(http_requests_total{status_code=~'5..'}[5m]) / rate(http_requests_total[5m])" }]
      },
      {
        "title": "数据库连接池使用率",
        "type": "gauge",
        "targets": [{ "expr": "db_pool_active_connections" }]
      },
      {
        "title": "Node.js 内存使用",
        "type": "graph",
        "targets": [{ "expr": "nodejs_heap_size_total_bytes" }]
      },
      {
        "title": "事件循环延迟",
        "type": "graph",
        "targets": [{ "expr": "nodejs_eventloop_lag_seconds" }]
      }
    ]
  }
}
```

#### 4.2.5 快速定位工具

| 工具 | 用途 | 实现方式 |
|------|------|---------|
| 分布式追踪 | 请求全链路追踪 | OpenTelemetry SDK → Jaeger/Zipkin |
| 错误堆栈关联 | 错误自动关联源码行号 | Source Map + error stack parser |
| 用户行为回放 | 重现用户操作序列 | rrweb / LogRocket (可选) |
| 日志查询 | 快速搜索结构化日志 | Loki + Grafana / ELK Stack |

---

## 第五部分：CI/CD 流水线配置（GitHub Actions）

### 5.1 完整流水线架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         GitHub Actions CI/CD                         │
│                                                                       │
│  ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │ Lint &  │    │  Unit Test   │    │ Integration │    │  Build   │ │
│  │ TypeCheck│──▶│  + Coverage  │──▶│   Test      │──▶│  + Push  │ │
│  │         │    │  ≥ 90%       │    │  + Coverage │    │  Docker  │ │
│  └─────────┘    └──────────────┘    └─────────────┘    └──────────┘ │
│                                                           │          │
│                                                           ▼          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Post-Deploy                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐ │   │
│  │  │ E2E Test │  │ Perf     │  │ Smoke Test │  │ Monitor   │ │   │
│  │  │ Playwright│  │ Budget   │  │ Health     │  │ Activate  │ │   │
│  │  └──────────┘  └──────────┘  └────────────┘  └───────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 工作流文件

#### 5.2.1 Pre-merge 门禁（PR 检查）

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ── 阶段 1: 静态检查 ──
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run check:encoding
      - run: npm audit --audit-level=high

  # ── 阶段 2: 单元测试 + 覆盖率门禁 ──
  unit-test:
    name: Unit Tests + Coverage
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Run unit tests with coverage
        run: npm run test:coverage -- --coverage.reportsDirectory=coverage/unit
      - name: Coverage gate check (≥90%)
        run: |
          node -e "
            const report = require('./coverage/unit/coverage-final.json');
            const total = Object.values(report).reduce((acc, f) => {
              const s = f.s || {};
              acc.total += Object.keys(s).length;
              acc.covered += Object.values(s).filter(v => v > 0).length;
              return acc;
            }, { total: 0, covered: 0 });
            const pct = ((total.covered / total.total) * 100).toFixed(1);
            console.log('Unit Coverage: ' + pct + '%');
            if (parseFloat(pct) < 90) { process.exit(1); }
          "
      - name: Upload unit coverage
        uses: actions/upload-artifact@v4
        with:
          name: unit-coverage
          path: coverage/unit/
          retention-days: 3

  # ── 阶段 3: API 集成测试 + 覆盖率门禁 ──
  integration-test:
    name: Integration Tests + Coverage
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Run integration tests
        run: npx vitest run --config vitest.integration.config.ts --coverage
      - name: Coverage gate check (≥90%)
        run: |
          node -e "
            const report = require('./coverage/integration/coverage-final.json');
            const total = Object.values(report).reduce((acc, f) => {
              const s = f.s || {};
              acc.total += Object.keys(s).length;
              acc.covered += Object.values(s).filter(v => v > 0).length;
              return acc;
            }, { total: 0, covered: 0 });
            const pct = ((total.covered / total.total) * 100).toFixed(1);
            console.log('Integration Coverage: ' + pct + '%');
            if (parseFloat(pct) < 90) { process.exit(1); }
          "
      - name: Upload integration coverage
        uses: actions/upload-artifact@v4
        with:
          name: integration-coverage
          path: coverage/integration/
          retention-days: 3

  # ── 阶段 4: 构建验证 ──
  build:
    name: Build Verification
    needs: [unit-test, integration-test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run build
      - name: Verify build output
        run: |
          test -f dist/server.mjs || exit 1
          test -f dist/index.html || exit 1
          echo "Build verification passed"
```

#### 5.2.2 Post-deploy E2E 测试

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  schedule:
    # 每日凌晨 2 点（北京时间 10:00）定时回归
    - cron: '0 18 * * *'
  workflow_dispatch:

jobs:
  e2e:
    name: E2E Tests (${{ matrix.browser }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
      fail-fast: false

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test_root
          MYSQL_DATABASE: supply_os_test
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps ${{ matrix.browser }}

      - name: Seed test database
        run: npx tsx scripts/seed-test-db.ts
        env:
          MYSQL_HOST: 127.0.0.1
          MYSQL_PORT: 3306
          MYSQL_USER: root
          MYSQL_PASSWORD: test_root
          MYSQL_DATABASE: supply_os_test

      - name: Run E2E tests
        run: npx playwright test --project=${{ matrix.browser }}
        env:
          NODE_ENV: test
          MYSQL_HOST: 127.0.0.1
          MYSQL_DATABASE: supply_os_test
          PAYMENT_MODE: mock

      - name: Upload E2E report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-report-${{ matrix.browser }}
          path: |
            e2e-results/
            test-results/
          retention-days: 7

  # ── 覆盖率合并 ──
  merge-coverage:
    name: Merge Coverage Reports
    needs: [e2e]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Download all coverage artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: "*-coverage"
          path: coverage/
      - name: Merge coverage reports
        run: npx istanbul-merge --out coverage/merged/coverage-final.json coverage/unit/coverage-final.json coverage/integration/coverage-final.json
      - name: Final coverage gate (≥95%)
        run: |
          node -e "
            const report = require('./coverage/merged/coverage-final.json');
            const total = Object.values(report).reduce((acc, f) => {
              const s = f.s || {};
              acc.total += Object.keys(s).length;
              acc.covered += Object.values(s).filter(v => v > 0).length;
              return acc;
            }, { total: 0, covered: 0 });
            const pct = ((total.covered / total.total) * 100).toFixed(1);
            console.log('Merged Coverage: ' + pct + '%');
            if (parseFloat(pct) < 95) { process.exit(1); }
          "
      - name: Upload merged coverage
        uses: actions/upload-artifact@v4
        with:
          name: merged-coverage
          path: coverage/merged/
          retention-days: 30
```

### 5.3 执行时机总结

| 阶段 | 触发时机 | 执行内容 | 门禁 |
|------|---------|---------|------|
| **Pre-commit** | 开发者 `git commit` | ESLint + Prettier + tsc | 本地拦截 |
| **Pre-merge** | PR 创建/更新 | Lint + 单元测试 + 集成测试 + 构建 | 覆盖率 ≥90%，通过率 100% |
| **Post-merge** | 合并到 main | E2E (3 浏览器) + 覆盖率合并 | 合并覆盖率 ≥95% |
| **Post-deploy** | 部署完成 | 冒烟测试 + 健康检查 | 服务可达 + 指标正常 |
| **Nightly** | 每日 02:00 | 全量 E2E 回归 | 通过率 100% |

---

## 第六部分：覆盖率报告模板与达标标准

### 6.1 覆盖率报告模板

```markdown
# Supply-OS 测试覆盖率报告

**生成时间**: 2026-08-25T10:00:00Z
**Commit**: abc1234
**分支**: main

## 总览

| 测试层级 | 语句覆盖率 | 分支覆盖率 | 函数覆盖率 | 行数 | 达标 |
|---------|-----------|-----------|-----------|------|------|
| 单元测试 | 93.2% | 88.5% | 95.1% | 10,252/11,000 | ✅ |
| 集成测试 | 78.4% | 72.1% | 82.3% | 8,624/11,000 | ❌ (独立不达标) |
| E2E 测试 | 91.0% | 85.3% | 93.2% | 10,010/11,000 | ✅ |
| **合并** | **96.8%** | **92.1%** | **97.5%** | **10,648/11,000** | **✅** |

## 模块明细（单元测试）

| 模块 | 语句覆盖率 | 待覆盖行数 | 状态 |
|------|-----------|-----------|------|
| server/utils | 98.5% | 3 | ✅ |
| server/services | 94.2% | 238 | ✅ |
| server/repos | 96.8% | 14 | ✅ |
| server/routes | 91.3% | 125 | ✅ |
| server/payment | 95.0% | 16 | ✅ |
| server/middleware | 97.1% | 4 | ✅ |
| src/core | 96.5% | 11 | ✅ |
| src/features | 92.8% | 242 | ✅ |
| src/shared | 95.3% | 28 | ✅ |

## 未达标项

无。

## 趋势

| 日期 | 合并覆盖率 | 单元测试 | E2E | 用例数 |
|------|-----------|---------|-----|--------|
| 2026-08-25 | 96.8% | 93.2% | 91.0% | 1,556 |
| 2026-08-18 | 6.3% | 6.3% | — | 354 |
```

### 6.2 达标判定标准

| 指标 | 最低标准 | 推荐标准 | 理想标准 |
|------|---------|---------|---------|
| 单元测试语句覆盖率 | ≥ 85% | ≥ 90% | ≥ 95% |
| 单元测试分支覆盖率 | ≥ 75% | ≥ 85% | ≥ 90% |
| 集成测试语句覆盖率 | ≥ 80% | ≥ 90% | ≥ 95% |
| E2E 语句覆盖率 | ≥ 80% | ≥ 90% | ≥ 95% |
| 合并语句覆盖率 | ≥ 90% | ≥ 95% | ≥ 98% |
| 通过率 | 100% | 100% | 100% |
| Flaky 测试数 | 0 | 0 | 0 |
| 单元测试耗时 | < 300s | < 180s | < 120s |
| E2E 测试耗时 | < 600s | < 300s | < 180s |

### 6.3 覆盖率门禁执行规则

1. **PR 合并门禁**: 单元测试 + 集成测试各自覆盖率 ≥ 90%，通过率 100%
2. **合并覆盖率门禁**: 合并覆盖率 ≥ 95%（仅 main 分支）
3. **覆盖率只增不减**: PR 不得降低已有覆盖率（CI 检查 delta）
4. **零容忍 Flaky**: 任何 flaky 测试必须在 24h 内修复或移除
5. **排除项审批**: 新增覆盖率排除项需 Code Review 审批

---

## 第七部分：监控告警配置示例

### 7.1 Prometheus 配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'supply-os'
    metrics_path: '/api/system/metrics'
    static_configs:
      - targets: ['supply-os:3039']
        labels:
          service: 'supply-os'
          environment: 'production'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

### 7.2 告警规则

```yaml
# alert_rules.yml
groups:
  - name: supply-os-alerts
    rules:
      # 高错误率
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status_code=~"5.."}[5m])
          / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "Supply-OS 5xx 错误率超过 5%"
          description: "当前值: {{ $value | humanizePercentage }}"

      # 慢 API
      - alert: SlowAPI
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 2000
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "API P95 响应时间超过 2s"
          description: "当前 P95: {{ $value }}ms"

      # 数据库连接池
      - alert: DBPoolExhausted
        expr: db_pool_active_connections / db_pool_max_connections > 0.8
        for: 2m
        labels: { severity: warning }
        annotations:
          summary: "数据库连接池使用率超过 80%"

      # 内存过高
      - alert: HighMemoryUsage
        expr: nodejs_heap_size_total_bytes > 1e9
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Node.js 堆内存超过 1GB"

      # 事件循环延迟
      - alert: EventLoopLag
        expr: nodejs_eventloop_lag_seconds > 0.1
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "事件循环延迟超过 100ms"

      # 服务不可达
      - alert: ServiceDown
        expr: up{job="supply-os"} == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "Supply-OS 服务不可达"
```

### 7.3 Alertmanager 通知配置

```yaml
# alertmanager.yml
route:
  receiver: 'default'
  routes:
    - match: { severity: critical }
      receiver: 'critical-alerts'
      repeat_interval: 15m
    - match: { severity: warning }
      receiver: 'warning-alerts'
      repeat_interval: 1h

receivers:
  - name: 'critical-alerts'
    webhook_configs:
      - url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
        send_resolved: true
    email_configs:
      - to: 'ops-team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'

  - name: 'warning-alerts'
    webhook_configs:
      - url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
        send_resolved: true
```

### 7.4 Docker Compose 监控栈

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alert_rules.yml:/etc/prometheus/alert_rules.yml
    ports: ['9090:9090']

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    ports: ['3000:3000']
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
    ports: ['9093:9093']

  loki:
    image: grafana/loki:latest
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/data
    ports: ['3100:3100']

volumes:
  grafana-data:
  loki-data:
```

---

## 附录 A：新增依赖清单

```json
{
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0",
    "istanbul-merge": "^2.0.0",
    "prom-client": "^15.0.0",
    "audit-ci": "^7.0.0"
  }
}
```

## 附录 B：新增 npm scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --coverage --coverage.reportsDirectory=coverage/unit",
    "test:integration": "vitest run --config vitest.integration.config.ts --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:merge-coverage": "npx istanbul-merge --out coverage/merged/coverage-final.json coverage/unit/coverage-final.json coverage/integration/coverage-final.json",
    "test:coverage-gate": "node scripts/coverage-gate.mjs",
    "perf:check": "npx tsx scripts/perf-budget-check.ts",
    "seed:test-db": "npx tsx scripts/seed-test-db.ts"
  }
}
```

## 附录 C：目录结构

```
supply-os/
├── tests/                          # 单元测试 + 集成测试
│   ├── server/
│   │   ├── utils/                  # B1: 工具函数补全
│   │   ├── services/               # B2-B4: 服务层
│   │   ├── repos/                  # B5: 数据层
│   │   ├── routes/                 # B6: 路由层
│   │   ├── payment/                # B7: 支付
│   │   ├── middleware/             # B7: 中间件
│   │   └── data/                   # B8: 数据
│   ├── src/
│   │   ├── core/                   # C1: 核心模块补全
│   │   ├── features/               # C2-C3: 功能模块
│   │   └── shared/                 # C4: 共享组件
│   └── integration/                # API 集成测试
│       ├── helpers.ts              # 测试辅助
│       ├── auth/                   # 认证域
│       ├── notices/                # 公告域
│       ├── payment/                # 支付域
│       ├── suppliers/              # 供应商域
│       ├── membership/             # 会员域
│       ├── training/               # 培训域
│       ├── admin/                  # 管理域
│       └── *.test.ts               # 其他域
├── e2e/                            # E2E 测试
│   ├── fixtures/                   # 测试数据 & 辅助
│   ├── flows/                      # 用户旅程 (6 文件)
│   ├── pages/                      # 页面渲染 (8 文件)
│   └── api/                        # API E2E (7 文件)
├── monitoring/                     # 监控配置
│   ├── prometheus.yml
│   ├── alert_rules.yml
│   ├── alertmanager.yml
│   └── grafana/
│       └── dashboards/
├── playwright.config.ts            # E2E 配置
├── vitest.config.ts                # 单元测试配置（更新）
├── vitest.integration.config.ts    # 集成测试配置（新增）
└── docker-compose.monitoring.yml   # 监控栈
```
