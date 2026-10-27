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
src/core       客户端框架：http(api-client) / auth(AuthContext) / i18n / events / perf / api
src/lib        服务端唯一树：db / repos / services / payment / middleware / i18n / types
```

**红线（改动必须保持）**：
1. `src/lib` 不 import `features/app`；允许 import `shared/constants` 与 `shared/data`（纯数据/常量层），禁止 import `shared/ui`、`shared/layout`、`shared/hooks`、`shared/filters`（组件/交互层）；
2. `src/core` 不 import features/lib/app（http↔auth 通过 `supply-os:*` 事件总线反向感知，禁止直接 import 环）；
3. `src/features` 不直接 import `@/lib/**`（服务端树），客户端一律经 `@/core/http` 的 `api()/apiCached()` 走 HTTP；feature 间禁止硬依赖，共享逻辑提升至 `shared/` 或经 `core/events` 事件总线解耦；跨层共用的**纯码形函数**（如骨架/行业码形制）归 `shared/constants/commodity-code.ts`、`shared/constants/industry-code.ts`（唯一实现；lib 同名模块仅为历史入口的 shim 再导出，不得往里加逻辑）；
   —— 红线 1~3 自 2026-10 起由 `eslint.config.js` 的 `@typescript-eslint/no-restricted-imports` 规则组机械化拦截（值导入 error；`import type` 豁免，编译期擦除零运行时影响）；此前红线已漂移出 features→lib 值导入 7 处，已全部修复。
4. 服务端唯一入口：`src/lib/**` + `src/instrumentation.ts`（无第二个服务端树）。
5. **不提供管理员功能**：本项目不承载管理后台、管理员专用接口或临时运维入口，不得存在 `/api/admin/*`、`/api/open/v1/keys` 等管理端路由，也不得硬编码这些接口的调用路径（历史上 `requireAdmin` 机制已于提交 `18d0d4fe` 彻底移除，不得复活）。管理员审核、运营发布、API Key 创建及状态/配额管理等操作由**项目外的内部服务或受控后台系统**负责，不以补管理员鉴权的方式在本项目保留。普通用户认证、业务权限校验、用户本人发布需求及开放数据查询 API 不受影响。由 `scripts/gates/check-no-admin-routes.mjs`（`npm run lint` / CI）拦截已禁止的管理路由及调用路径回流。
6. **宽表单一写入者 + 口径单一事实源**：`crm_notice_search` 的业务内容列与 `sync_src_hash` 只能由 `lib/services/search-sync/wide-row-builder` 的 `buildWideRow → upsertWideRows` 写入（指纹与内容取自**同一次 SELECT 快照**，不得分开算）；对账层（`wide-row-reconcile` / `wide-fingerprint`）**只允许返回待重建 id**，`src/lib/**` 禁止出现 `UPDATE crm_notice_search`（`db/migrations` 的一次性收敛除外）；宽表删除类操作只允许 `reconcileGhostRows` 与 `search-visibility/purgeNoticeSearch` 两个出口。跨层复用的口径（描述来源表达式、截断长度、译文 `model` 值、合格机会谓词）必须引用 `lib/utils/notice-field-limits` 与 `lib/utils/notice-qualified` 的导出，禁止就地字面量。平台公告 `rfq_status` 转为非 published 时，必须同步移除搜索侧可见性（宽表行 + Meili 文档 + 结果缓存）。由 `scripts/gates/check-wide-table-ssot.mjs`（`npm run lint` / CI）强制。

## 关键机制

- **认证**：`supply_os_auth_user`（AuthContext 持有）+ `supply_os_auth_token`（api-client 持有）；**401 只承载「未登录/凭据可刷新」语义**（见「API 契约规范」红线③），由 api-client 广播 `supply-os:unauthorized`，AuthContext 订阅处理（单向依赖 + 事件回传，无环）；会话已死（密码错、refresh token 无效/过期/撤销）走 403 + 专属码。
- **服务端状态**：无 react-query；`api-client` 模块级 TTL 缓存（5 分钟/容量 200/飞行中去重）承担 query 层——**仅 `apiCached()` 走该缓存**，裸 `api()` 无缓存无去重；首页类多实例共享数据源的 hooks（useHomeStats/useHotTopics/ContentColumns/useAwardsData）必须经 `apiCached()`，公开聚合端点（notices/stats、notices/countries、hot-topics、awards / awards/stats / awards/top）配套 `Cache-Control: public, max-age=600`。
- **首屏/i18n 分包**（2026-10）：客户端 i18n 初始资源只静态内联 zh（`core/i18n/client-bundles.ts`），其余语言经 `core/i18n/loader.ts` 动态 import 懒加载，语言检测/切换就绪后才 setLocale（失败保持当前语言不写 Cookie）；**loader 的 JSON 清单必须与 `locales/<lang>/*.json` 同步**，键一致性由 `check-i18n` 拦截。首页 page.tsx 与其它公开页同口径 `revalidate=3600`，并在渲染期直出 `lib/services/home-snapshot`（数字墙/地图初值进静态 HTML，口径与公开端点同一份 service）。`core/perf` 采集入口在 `src/app/providers.tsx` 的 AppInit 调用 `initPerfMonitor()`（旧注释的 main.tsx 为 Vite 遗留，不存在）。
- **支付**：`lib/payment/PaymentService` + provider 策略（mock/alipay/wechat）；回调路由 F20（TRADE_CLOSED → reverse）；状态机白名单 F19（仅 pending 可流转）。相关决策见 `docs/adr/`。
- **搜索**：`lib/services/search-sync`（宽表同步）与 `lib/services/search-orchestrator`（查询编排）**已解环**（A2/ARCH-P3，2026-09-05）：orchestrator 注册缓存失效回调供 sync 完成后调用，二者互相引用改为「回调 + 无依赖叶子模块直引」，不再经 barrel 回环。新代码禁止重新引入二者的直接 import。
- **宽表一致性**：判据由源指纹 `crm_notice_search.sync_src_hash` 承担——构建时与内容同快照写入，对账时用同一 `WIDE_FP_EXPR` 在 SQL 内实时重算比较（按主键游标窗口轮转），不等则委托 `syncWideIds` 重建。修复方即构建方，故必然收敛（可断言「连续两轮对账变更数为 0」）。**能力边界**：指纹只覆盖「输入侧变更」，宽表内容被旁路改坏它看不见——该完整性由红线 6（单一写入者 + 门禁）保证；若历史上存在疑义，把 `sync_src_hash` 批量置 `''` 即强制全表重导。`crm_agency_aliases` / 品目骨架树自身的变更不进指纹，需刷新走 `requestIndexRebuild`。详见 `docs/adr/0002-wide-table-single-writer.md`。**0002 的补集（2026-10-11）**：宽表派生列（`backbone_path` / `precise_backbone_path` 这类由其它表码集合换算出来的列）必须由 `buildWideRow` 计算并与业务列同一批 `upsertWideRows` 写入，禁止另起定时任务或人工脚本补列；且运行中的构建产物只能有一个 —— 列清单落后的第二个进程不会改坏内容，而是**少写一列**，指纹对它无感，只有闭合断言（有码必填、无码必空）查得出。详见 `docs/adr/0007-derived-columns-computed-by-builder.md`。

- **统一分类码 UGT**：全库权威类目树共用码前缀 `UGT-` = **Unified Global Taxonomy（统一全球分类码）**——把旧的品类字典码、桥表码与旧 8 位品类码收敛成一套 SSOT，融合国际商品分类标准、联合国 ISIC Rev.4 与国标 GB/T 4754 而成（非"凭空自研"）。核心不变量「码长即层级、父码=去末两位」⇒ 祖先链/子树前缀纯字符串可推，跨层筛选键同源。品目面 `UGT-`（SSOT：`shared/constants/commodity-code.ts`）、行业面 `UGT-I-`（SSOT：`shared/constants/industry-code.ts`）。命名与对外宣传口径的唯一出处：`docs/数据库设计/UGT统一分类码-命名与口径.md`。

## 测试与门禁

- 单测门禁 90%（白名单制 `vitest.config.ts coverage.include`——新文件需手动纳入）；集成门禁 80%。
- `npm run test:ci` = unit 门禁 + integration 门禁；CI 于 `.github/workflows/ci.yml`。
- 钱路（PaymentService / opportunity-unlock / payments.repo / 退款逆向）改动必须带测试。

### scripts 分层（版本控制口径）

`.gitignore` 采用「默认跟踪、按生命周期分桶」模型，新增脚本无需回来改忽略规则：

- `scripts/gates/`：CI / lint / build 门禁与必需工具（`check-*`、`coverage-gate`、`css-compat-gate`、`serve-style-smoke`、`verify-industry-links` 等）——**整目录跟踪**，缺脚本即流程断。
- `scripts/tools/`：持久但手动调用的运维工具（`daily-sync.cjs`、`deploy.sh`、`migrate-licenses`）——**跟踪**，须随 clone 存在。
- `scripts/ops/`：一次性 / 连生产库的探针 / 本机应急脚本（影子表切换、`verify-wide-ssot` 等）——**默认忽略**，本地保留不入库。
- 生成物一律落 `scripts/out`、`scripts/backups`、`**/.*-watermark.json`（`daily-sync.cjs` 的 `.sync` / `.service` 两份水位线）、`runtime/`、`temp/`（均忽略）。
- **一致性由 `scripts/gates/check-gitignore-consistency.mjs` 在 `npm run lint` / CI 强制**：禁止「跟踪却被忽略」的隐身文件、禁止越界跟踪 ops/生成物、禁止 npm 脚本引用未入库的 `scripts/**`、禁止 `scripts/` 根散放脚本。

### 测试目录分层（一目录一 runner）

- `tests/unit/**`（`{ts,tsx}`，vitest）：业务单测；门禁脚本的 `.ts` 自测归 `tests/unit/gates/`。
- `tests/gates/**`（`.test.mjs`，`node --test`）：只能在 Node/PostCSS 环境跑、且被测对象必须是**已跟踪**门禁脚本。
- `tests/integration/**`（vitest.integration）· `tests/e2e/**`（Playwright）。
- **硬规则：测试文件与被测脚本的跟踪状态必须同侧**——一次性 ops 脚本的临时测试放 `runtime/tests/`（与 SUT 同在忽略区），绝不进 `tests/`，杜绝「本地跑 / CI 不跑」漂移。
- E2E 分两层跑，**谁也不假装验了谁验不到的东西**：
  - **CI（无数据冒烟）**：`e2e` job 起 MySQL service + 只导入 `db/schema/*.sql` 结构基线（**不灌任何数据**）+ 起已构建产物，只跑 `tests/e2e/ci-smoke.spec.ts`：验证基线能建出**应用可查**的结构、关键页面静态骨架、鉴权与参数边界。缺 schema 基线时该 job 显式失败而非静默跳过。
  - **本地/内网（真库旅程）**：`npm run build && npm run start` 后 `npx playwright test --project=chromium`，跑 `critical-journeys.spec.ts` 与 `authenticated-journeys.spec.ts`（套餐卡片、标讯搜索、商机解锁、RFQ、会员流转）。这些旅程的数据事实源就是 `.env` 指着的库本身。
- **代码里不造业务数据**：项目已删除全部种子路径（`src/lib/db/seeds.ts`、`*-seed` 迁移、`agencyAliasSeed`），`ALL_MIGRATIONS` 保持为空，`SEED_ENABLED="off"`。因此 CI 测试库也不得写入套餐/权益矩阵/商机/配额等业务配置——哪怕用占位值，那等于造一份会与库漂移的平行真相（同口径红线见 `unlock-quota.ts`「不在代码里写数字」、`benefit-system.repo.ts`「缺格不猜默认值」）。
- 结构基线不手写：`node --env-file=.env scripts/tools/dump-schema-baseline.mjs` 从现网结构导出 `db/schema/baseline.sql`（幂等、只读库）；上线结构变更后重跑一次，diff 即基线漂移。

## 约定

- 错误反馈：表单内联校验错误 → 组件 message state；跨组件/异步操作结果 → sonner toast。
- 安全：出站 URL 仅 http/https 公网（`OutboundUrlSchema`）；DB 配置经 zod 校验（`DbConfigSchema`）；SQL 一律参数绑定；日志文件名过 basename；出站 MySQL 连接禁 multipleStatements。
- 新 API 路由：纯 service 委托（route 仅鉴权/参数校验/编排调用，业务 SQL 下沉 `lib/services`，不得在 route 内 `new XxxRepo()` 直连）+ 错误 envelope `{code, message}`（4xx/5xx），成功默认返回裸载荷（2xx）。
  - **历史成功信封已归零（2026-10-22 迁移完成）**：原 26 个返回 `{code:0, message, data}` 成功信封的端点已全部改为成功返裸载荷——最后一批为 **AI（notices/[id] 的 ai-match、ai-summary，共 2）+ RFQ 域（create + [id] 及其 award/invite/quotes/reopen/submit/unaward/withdraw，共 9）**（此前已迁：notifications、supplier-diagnosis、suppliers/similar、user/enterprise、user/keyword-groups、user/llm-config、user/supplier-pool 共 7 个域）。AI 的流式摘要走独立 `/ai-summary/stream`（SSE，不受影响），仅 GET/POST 去信封，wrapper 内部解包、hook 消费方签名不变零改动；RFQ 域 route + 消费方（rfqQuotes/InvitePanel/详情页/edit 页/RfqWizard）+ 3 个集成测试（rfq-lifecycle/quotes/invite）同步。旧文档所称「约 11 个 AI 端点」与 `/ai-score` 均与代码不符（`/api/notices/[id]/ai-score` 路由不存在）。
  - **迁移口径（已完成域采用）**：有唯一 client wrapper 的域（keyword-groups/notifications/diagnosis/llm-config），只改 route + wrapper、对外签名不变→消费方零改动；无 wrapper 直调的（supplier-pool/enterprise），逐消费方清点去 `.data`（本批共 4 处）。错误信封 `{code, message}`（4xx/5xx）统一保留。
  - **红线守卫**：`scripts/gates/check-api-success-shape.mjs`（`npm run lint` / CI）拦截 2xx 成功信封——任何 `route.ts` 出现成功哨兵 `code: 0` 即失败。**2026-10-22 迁移全部完成后递减白名单已清空为空集**，红线转为零容忍；若未来确需例外须显式从空集重新登记（应尽量避免）。
  - **未治理的第三种约定（待决策，不在上述契约范畴）**：另有一批路由返 `{ success: true, ... }`（少数如 `/api/supplier-claims` GET 用嵌套 `{ success, data }`），而非 `{code,message,data}`。它不含成功哨兵 `code:0`，故本门禁不覆盖；语义上 `success` 标志冗余但非破损（`useClaimExpiry` 读 `res.data` 对 supplier-claims 的 `{success,data}` 是正确的）。是否统一并入裸载荷（含新增第二条门禁 + 逐消费方清点）留作独立批次决策。

### API 契约规范（三条红线 · 同一套门禁骨架）

四条 API 契约红线（成功形态 + 下述①②③）**共用一份扫描骨架** `scripts/gates/lib/api-contract.mjs`：递归收集、括号配平取调用实参、字符偏移→行号、`✖ [TAG] 违规 N 处：` 报告格式、递减白名单「已不再命中就提示删行」的卫生检查都在骨架里单点实现——新增第 N 条红线只写规则本体，不再各抄一份扫描器。扫描根统一由环境变量 `API_CONTRACT_SCAN_ROOT` 覆盖（自测 fixture 用）。自测统一走 `tests/gates/lib/gate-runner.mjs`，每条红线三面必测：**真仓库必绿 + fixture 必拦得住 + 合规写法不得误伤**（`node --test`，已接 `npm run lint`）。

| 红线 | 口径 | 门禁 | 现状（2026-10-27） |
|---|---|---|---|
| **①** 错误码 SSOT | 码值只集中在 `shared/constants/api`（同值不得多常量）；调用处必须引用 `EC_` 常量，禁裸数字（含 `routeError` 第二参、`codeByPath`、响应体 `code:` 字面量）；被路由引用的码必须已登记进 `core/http/error-map` 的 `CODE_MAP`——`EC_INVALID_PARAMS`/`EC_INVALID_REQUEST` 刻意不登记，让后端 message 直出 | `check-api-error-codes.mjs` | 全域零裸数字、引用码全登记 |
| **②** 响应字段命名 | **响应实体字段用 `camelCase`**；请求参数与分页/元数据键允许 `snake_case`（`page_size`/`total`/`limit`/`next_cursor`… 见门禁内 `METADATA_KEYS`）。只静态检查 `NextResponse.json(...)`/`Response.json(...)` 的**显式对象字面量键**；`...row` 展开与 mapper 产出的键不在本静态面内，由分域迁移 + 端到端验证覆盖 | `check-api-field-naming.mjs` | 存量显式 snake 键 68 项冻结为**递减白名单**，新代码写 snake 键即失败 |
| **③** 401 语义单一化 | `401` = 「未登录/需要认证（凭据缺失或过期，**可刷新**）」，业务码只允许 `EC_AUTH_REQUIRED`/`EC_USER_REQUIRED`/`EC_API_KEY_INVALID`/`EC_API_KEY_EXPIRED`；**会话已死与凭据被拒一律 403 + 专属码**：登录密码错→`EC_ACCOUNT_ISSUE`，refresh token 无效/过期/撤销→`EC_REFRESH_TOKEN_*`（均 403）。开放 API 的 `X-API-Key` 边界保留 401（标准 REST 语义，不经本刷新链路） | `check-api-401-semantics.mjs` | 已普查并归位：会话已死/凭据被拒的 5 处改 403（登录 2 处 + 刷新 3 处）；剩下的 401 发放点（requireUserKey / premium 需登录 / SSE 票券 / 开放 API Key 边界）全为认证语义，且码必须是允许集内的 `EC_` 常量（裸数字同判，与①同口径） |

- **为什么③要治本**：api-client 把 `res.status === 401` 当作「access token 过期 → 刷新重试，刷新失败即清凭据 + 登出」的信号。把「密码错误」「refresh token 已死」写成 401 会误触发刷新/登出链路（登录失败去刷一个新 session 根本没有的 token），且让 401 含义漂移。改 403 后**客户端行为不变**：`tryRefreshToken()` 对 `!res.ok` 一律返回 `null`，仍然清凭据 + 广播 `supply-os:unauthorized`。
- **递减白名单怎么减**：迁移一个端点 = 同批改掉前端读取点（`src/features/**`、wrapper）+ 删掉白名单对应行；门禁会在「登记项已不再命中」时打印待收敛提示，机器兜住「忘了删行」。
- **`...row` 展开区**：命名红线看不见的地方（宽表/直查列名透传）以各域 mapper 为改造点——在 service 层出 camelCase，route 只做拼装；不得靠往白名单加行来「解决」门禁。

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
- **memo 生效前提**：展示组件的事件 props 必须由容器 `useCallback` 稳定（或状态 setter 直传）；父侧每实例新建的内联闭包会击穿 memo，禁止
- **数据获取统一在 hooks 层**：组件通过 props 或 hook 消费数据，不在 JSX 中直接调用 `api()`
- 2026-10 已按本标准落地的拆分（原文件保留为薄壳/barrel，消费方导入路径不变）：
  `features/procurement/components/advanced-search/*`（AdvancedSearchPanel 602→376，容器留面板、子件 DateRangePicker/KeywordGroupPicker/KeywordChip+常量）；
  `app/(public)/award-intelligence/modals/*`（Modals.tsx 520→19 行 barrel，7 弹窗一文件 + `_shared` 展示件）；
  `app/(public)/settings/supplier-pool/components/*`（page-client 408→260，AddPanel/PoolItemRow/PoolListStates）；
  `features/home/components/content/*`（ContentColumns 261→137）。

### 共享工具函数归属

- 跨 feature 使用的纯函数 → `shared/utils/`（如 `noticeDisplay.ts`、`countdown.ts`、`format.ts`）
- feature 内部工具 → `features/{name}/utils/`（如 `formatDeadlineZh.ts`）
- 禁止在组件文件内定义可复用的工具函数（如 `formatNumber`）

### 异常态覆盖要求

- 每个数据获取点必须区分三种状态：loading（骨架屏） / error（错误提示） / empty（空态文案）
- 首页级组件必须包裹 `ErrorBoundary`，防止子组件渲染错误导致白屏
- `.catch(() => {})` 仅适用于非关键路径（如热门标签、统计数据），关键路径（支付、解锁）必须有错误处理
