# Supply OS — 架构与分层约定

> 本文档是 AI 协作与新成员的分层权威参考。发现与文档不符的代码，以代码实际行为为准并回写本文档。
> 完整发现清单见 `docs/reviews/2026-09-03-architecture-assessment.md`。

## 技术栈

Next.js 16 App Router (standalone) · React 19 · TypeScript · Tailwind v4 · shadcn/ui（Radix）· react-hook-form · mysql2 · Meilisearch · Vitest + Playwright · i18n（自研 core/i18n + react-i18next）

## 分层与依赖方向（红线）

```
src/app        路由层：page.tsx（服务端壳，仅 metadata/ISR）+ page-client.tsx（客户端接管）
               └─ api/**/route.ts —— 目标形态：薄壳，编排下沉 lib/services
src/features   特性层：components/ + hooks/ + pages/ + api/（HTTP 封装）+ constants
src/shared     跨特性 UI（ui/layout/forms/filters）与工具
src/core       客户端框架：http(api-client) / auth(AuthContext) / i18n / events / perf / unspsc
src/lib        服务端唯一树：db / repos / services / payment / middleware / i18n / types
```

**红线（改动必须保持）**：
1. `src/lib` 不 import `features/app`；允许 import `shared/constants` 与 `shared/data`（纯数据/常量层），禁止 import `shared/ui`、`shared/layout`、`shared/hooks`、`shared/filters`（组件/交互层）；
2. `src/core` 不 import features/lib/app（http↔auth 通过 `supply-os:*` 事件总线反向感知，禁止直接 import 环）；
3. `src/features` 不直接 import `@/lib/**`（服务端树），客户端一律经 `@/core/http` 的 `api()/apiCached()` 走 HTTP；feature 间禁止硬依赖，共享逻辑提升至 `shared/` 或经 `core/events` 事件总线解耦；
4. 服务端唯一入口：`src/lib/**` + `src/instrumentation.ts`（无第二个服务端树）。
5. **不提供管理员功能**：本项目不承载管理后台、管理员专用接口或临时运维入口，不得存在 `/api/admin/*`、`/api/open/v1/keys` 等管理端路由，也不得硬编码这些接口的调用路径（历史上 `requireAdmin` 机制已于提交 `18d0d4fe` 彻底移除，不得复活）。管理员审核、运营发布、API Key 创建及状态/配额管理等操作由**项目外的内部服务或受控后台系统**负责，不以补管理员鉴权的方式在本项目保留。普通用户认证、业务权限校验、用户本人发布需求及开放数据查询 API 不受影响。由 `scripts/check-no-admin-routes.mjs`（`npm run lint` / CI）拦截已禁止的管理路由及调用路径回流。
6. **宽表单一写入者 + 口径单一事实源**：`crm_notice_search` 的业务内容列与 `sync_src_hash` 只能由 `lib/services/search-sync/wide-row-builder` 的 `buildWideRow → upsertWideRows` 写入（指纹与内容取自**同一次 SELECT 快照**，不得分开算）；对账层（`wide-row-reconcile` / `wide-fingerprint`）**只允许返回待重建 id**，`src/lib/**` 禁止出现 `UPDATE crm_notice_search`（`db/migrations` 的一次性收敛除外）；宽表删除类操作只允许 `reconcileGhostRows` 与 `search-visibility/purgeNoticeSearch` 两个出口。跨层复用的口径（描述来源表达式、截断长度、译文 `model` 值、合格机会谓词）必须引用 `lib/utils/notice-field-limits` 与 `lib/utils/notice-qualified` 的导出，禁止就地字面量。平台公告 `rfq_status` 转为非 published 时，必须同步移除搜索侧可见性（宽表行 + Meili 文档 + 结果缓存）。由 `scripts/check-wide-table-ssot.mjs`（`npm run lint` / CI）强制。

## 关键机制

- **认证**：`supply_os_auth_user`（AuthContext 持有）+ `supply_os_auth_token`（api-client 持有）；401 由 api-client 广播 `supply-os:unauthorized`，AuthContext 订阅处理（单向依赖 + 事件回传，无环）。
- **服务端状态**：无 react-query；`api-client` 模块级 TTL 缓存（5 分钟/容量 200/飞行中去重）承担 query 层。
- **支付**：`lib/payment/PaymentService` + provider 策略（mock/alipay/wechat）；回调路由 F20（TRADE_CLOSED → reverse）；状态机白名单 F19（仅 pending 可流转）。相关决策见 `docs/adr/`。
- **搜索**：`lib/services/search-sync`（宽表同步）与 `lib/services/search-orchestrator`（查询编排）**已解环**（A2/ARCH-P3，2026-09-05）：orchestrator 注册缓存失效回调供 sync 完成后调用，二者互相引用改为「回调 + 无依赖叶子模块直引」，不再经 barrel 回环。新代码禁止重新引入二者的直接 import。
- **宽表一致性**：判据由源指纹 `crm_notice_search.sync_src_hash` 承担——构建时与内容同快照写入，对账时用同一 `WIDE_FP_EXPR` 在 SQL 内实时重算比较（按主键游标窗口轮转），不等则委托 `syncWideIds` 重建。修复方即构建方，故必然收敛（可断言「连续两轮对账变更数为 0」）。**能力边界**：指纹只覆盖「输入侧变更」，宽表内容被旁路改坏它看不见——该完整性由红线 6（单一写入者 + 门禁）保证；若历史上存在疑义，把 `sync_src_hash` 批量置 `''` 即强制全表重导。`crm_agency_aliases` / UNSPSC 字典树自身的变更不进指纹，需刷新走 `requestIndexRebuild`。详见 `docs/adr/0002-wide-table-single-writer.md`。

## 测试与门禁

- 单测门禁 90%（白名单制 `vitest.config.ts coverage.include`——新文件需手动纳入）；集成门禁 80%。
- `npm run test:ci` = unit 门禁 + integration 门禁；CI 于 `.github/workflows/ci.yml`。
- 钱路（PaymentService / opportunity-unlock / payments.repo / 退款逆向）改动必须带测试。

## 约定

- 错误反馈：表单内联校验错误 → 组件 message state；跨组件/异步操作结果 → sonner toast。
- 安全：出站 URL 仅 http/https 公网（`OutboundUrlSchema`）；DB 配置经 zod 校验（`DbConfigSchema`）；SQL 一律参数绑定；日志文件名过 basename；出站 MySQL 连接禁 multipleStatements。
- 新 API 路由：纯 service 委托（route 仅鉴权/参数校验/编排调用，业务 SQL 下沉 `lib/services`，不得在 route 内 `new XxxRepo()` 直连）+ 错误 envelope `{code, message}`（4xx/5xx），成功默认返回裸载荷（2xx）。
  - **已知例外（待统一）**：AI 相关端点（`/api/notices/[id]/ai-score|ai-match|ai-summary` 等，约 11 个）仍返回 `{code:0, message, data}` 三字段信封，客户端按端点解包。因涉及全部消费方解析链，信封统一列为后续项，暂不改动 wire 格式。

### Hooks 命名与职责约定

- **数据获取 hook**：`use{Entity}Data` / `use{Entity}Stats`（如 `useHomeStats`、`useListingStats`、`useHotTopics`）
  - 同一数据源的多个消费者必须共享同一 hook，禁止各自内联 `api()` 调用
  - hook 内部处理 loading/error 状态，调用方通过返回值判断
- **交互逻辑 hook**：`use{Feature}Payment` / `use{Feature}Flow`（如 `useMembershipPayment`）
  - 封装多步骤业务流程（弹窗状态 + API 调用 + 事件触发）
  - 页面组件仅消费 hook 返回值，不直接操作底层状态
- **所有 hook 必须通过 feature barrel（`index.ts`）导出**

### 组件拆分标准

- 单文件 > 200 行 → 必须拆分为子组件或提取 hook
- **容器组件（container）**：仅编排子组件顺序，不含业务逻辑（如 `AboutSection` 22 行容器 + 4 个子组件）
- **展示组件（presentational）**：接收 props 渲染 UI，不直接调用 API；适合包裹 `React.memo`
- **数据获取统一在 hooks 层**：组件通过 props 或 hook 消费数据，不在 JSX 中直接调用 `api()`

### 共享工具函数归属

- 跨 feature 使用的纯函数 → `shared/utils/`（如 `noticeDisplay.ts`、`countdown.ts`、`format.ts`）
- feature 内部工具 → `features/{name}/utils/`（如 `formatDeadlineZh.ts`）
- 禁止在组件文件内定义可复用的工具函数（如 `formatNumber`）

### 异常态覆盖要求

- 每个数据获取点必须区分三种状态：loading（骨架屏） / error（错误提示） / empty（空态文案）
- 首页级组件必须包裹 `ErrorBoundary`，防止子组件渲染错误导致白屏
- `.catch(() => {})` 仅适用于非关键路径（如热门标签、统计数据），关键路径（支付、解锁）必须有错误处理
