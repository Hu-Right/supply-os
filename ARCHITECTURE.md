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

| 红线 | 口径 | 门禁 | 现状（2026-10-28） |
|---|---|---|---|
| **①** 错误码 SSOT | 码值只集中在 `shared/constants/api`（同值不得多常量）；调用处必须引用 `EC_` 常量，禁裸数字（含 `routeError` 第二参、`codeByPath`、响应体 `code:` 字面量）；被路由引用的码必须已登记进 `core/http/error-map` 的 `CODE_MAP`——`EC_INVALID_PARAMS`/`EC_INVALID_REQUEST` 刻意不登记，让后端 message 直出 | `check-api-error-codes.mjs` | 全域零裸数字、引用码全登记 |
| **②** 响应字段命名 | **响应实体字段用 `camelCase`**；请求参数与分页/元数据键允许 `snake_case`（`page_size`/`total`/`limit`/`next_cursor`… 见门禁内 `METADATA_KEYS`）。两条规则同走 `NextResponse.json(...)`/`Response.json(...)` 一面：规则一查**对象字面量键**（显式 `k:`、ES6 简写 `{ k, }`，以及 `const body = { … }; json(body)` 这种键在声明处的间接字面量）；规则二拦**整块透出**（`json(变量)` / `json({ ...盲区源 })`）——实参与其本地初始化式里没有视图 mapper 痕迹又未登记→ 当场失败。mapper 产出的键仍不在本静态面内，由分域迁移 + 路由级断言 + 只读探针覆盖 | `check-api-field-naming.mjs` | 显式 snake 键：递减白名单 68 项已**清零**（登记行全删）——auth 全域、supplier-diagnosis、learning/training/report-preview、claims/interest/unlock、crm/chat（消息 + 会话四处出口）、notices 全域（detail/preview/content/unified-search/stats）、payment/orders 建单与查单、解锁记录三端点、opportunities 与 awards 列表、membership 五端点整族均已迁 camelCase，新代码写 snake 键即失败。整块透出（2026-10-28 新规则暴露）：**登记 30 处**，A 已收视图+实测/断言 19 / B 实测无 snake 但未收 mapper 11 / **C 尚未实测 0（已清零）**。开放 API 已按（乙）整族迁 camel，于同日入库。 |
| **③** 401 语义单一化 | `401` = 「未登录/需要认证（凭据缺失或过期，**可刷新**）」，业务码只允许 `EC_AUTH_REQUIRED`/`EC_USER_REQUIRED`/`EC_API_KEY_INVALID`/`EC_API_KEY_EXPIRED`；**会话已死与凭据被拒一律 403 + 专属码**：登录密码错→`EC_ACCOUNT_ISSUE`，refresh token 无效/过期/撤销→`EC_REFRESH_TOKEN_*`（均 403）。开放 API 的 `X-API-Key` 边界保留 401（标准 REST 语义，不经本刷新链路） | `check-api-401-semantics.mjs` | 已普查并归位：会话已死/凭据被拒的 5 处改 403（登录 2 处 + 刷新 3 处）；剩下的 401 发放点（requireUserKey / premium 需登录 / SSE 票券 / 开放 API Key 边界）全为认证语义，且码必须是允许集内的 `EC_` 常量（裸数字同判，与①同口径） |

- **为什么③要治本**：api-client 把 `res.status === 401` 当作「access token 过期 → 刷新重试，刷新失败即清凭据 + 登出」的信号。把「密码错误」「refresh token 已死」写成 401 会误触发刷新/登出链路（登录失败去刷一个新 session 根本没有的 token），且让 401 含义漂移。改 403 后**客户端行为不变**：`tryRefreshToken()` 对 `!res.ok` 一律返回 `null`，仍然清凭据 + 广播 `supply-os:unauthorized`。
- **递减白名单怎么减**：迁移一个端点 = 同批改掉前端读取点（`src/features/**`、wrapper）+ 删掉白名单对应行；门禁会在「登记项已不再命中」时打印待收敛提示，机器兜住「忘了删行」。
  自测不再绑真实存量：样本登记项由 `API_FIELD_NAMING_ALLOWLIST_EXTRA` 注入 fixture 子进程，
  否则每迁完一族都要回头改自测（payment/orders 迁走时就是这样把自测改红的）。
- **白名单清零 ≠ 债务清零（`...row` 展开与整块透出区）**：静态面原先只看得见 `json({ 显式键 })`（已覆盖显式 `k:` 与 ES6 简写 `{ k, }` 两类，简写曾漏过 report/preview 的 `total_report_chars`，现由自测钉住）；而全站有 30+ 个出口是 `NextResponse.json(变量)` 整块透出（repo 行 / 服务结果直接上网），门禁一个键都看不见。**2026-10-28 起这条盲区本身进门禁**（② 加规则二）：`json(变量)`、`json({ ...盲区源 })` 只要实参（或其本地 `const X = …` 初始化式）里没有视图 mapper 痕迹，就当场失败，除非登记在 `OPAQUE_ALLOWLIST`；反过来 `const body = { user_id: … }; json(body)` 这种「键在声明处」的间接字面量现在也被规则一查得到（行号指声明行）。登记集现状 **30 处**，按证据强度分组写明：A「已收视图 + 真库探针实测 snake 键 0」19 处、B「实测无 snake 键但未收 mapper」11 处、C「**尚未实测**」**已清零**（2026-10-28）。重出清单：`API_FIELD_NAMING_EMIT_OPAQUE=1 node scripts/gates/check-api-field-naming.mjs`（分组计数由 `runtime/count-opaque-groups.mjs` 复核）。
  登记集靠两样东西继续收敛：
  ① 每个域一个唯一 mapper（`notice-public/view.ts`、`membership/view.ts`、`awards/view.ts`、
  `payment-history-view.ts`、`chat-service` 的消息/会话视图、`opportunities/route.ts` 的行→视图函数），
  改名规则本身在 `shared/utils/case-keys`；在 service/出口层出 camelCase，route 只做拼装，
  不得靠往白名单加行来「解决」门禁。
  ② 真实取证：只读探针跑真库，按路由出口写法扫实际响应键
  （`runtime/probe-opaque-c-group.ts` 等，runtime/ 不入库），配路由级断言钉住。
  新端点直接 `json(行)` 属于同族违规：现在会被规则二当场拦下，而不是等探针事后拉到。
  整块透出的响应体（如 `NextResponse.json(list)`）靠路由级集成测试钉住键名：
  `tests/integration/api-routes/payment-orders-list.test.ts` 用真实 orchestrator + 假仓库
  跑路由，断言 wire 上无 snake 键；新迁入这种端点时补同样的测试，不要只改类型。
- **2026-10-28 C 组只读取证**（`runtime/probe-opaque-c-group.ts`，进程内调与路由同一条生产链）：6 条拿到真实键集合——`suppliers/stats`(6)、`industries/tree`、`learning/materials/[id]/content`(4)、`suppliers/[id]`(26)、`notices/unified-search`(143、items 已过 `toNoticeListView`) 全部无 snake→升 B；`notices/[id]/ai-summary` 的 GET 缓存分支 8 键全 camel，但同一登记 id 还覆盖 POST 生成分支，**整条不升组**。剩下的 C 全部是「跑不了」而不是「应该没事」：写路径（`leads/log`、`favorite`、`feedback`、`training/orders` 建单）、触付费 LLM（`ai-match`、`ai-summary` POST）、触外部网关（`training/orders/[orderNo]` 查单）、可能触外部翻译服务（`translation`）、库里无数据（`queue`）。
  取证过程中踩到一个**探针自身的假阳性**：直接扫 `searchUnified()` 的返回值会报 99 个 snake 键（那是服务内部字段），而路由实际写的是 `{ ...result, items: toNoticeListView(result.items), page_size }`——按路由出口复现后才是 0。**探针必须复现出口写法，不是拿服务结果乱扫**。
  还踩到一个静默降级：连不上库时 `loadIndustryChildren` 返回 `[]`，「0 个键」看着像过关——探针现在把「一个键都没扫到」判为 inconclusive，不计入已核。
- **B/C 收敛第一批（2026-10-28）：先修「类型抹平」再谈探针**。分诊（`runtime/triage-opaque-registry.mjs`，离线把每条登记项的来源函数签名拉出来）发现一批 C 根因不在命名而在**包装层把返回类型抹平了**：`fetchNoticeTranslation: Promise<unknown>`、`submitNoticeFeedback: Promise<Record<string, unknown>>`（带一次 `as unknown as` 双断言）——整块透出的键名本来只有类型层能兜，抹平后 tsc、门禁、探针三路都查不到，「看不见」就成了「没人能查」。修法是恢复具名契约（`NoticeTranslationPayload` / `FeedbackResult`）并在单测里**用具名类型标注当编译期闸门**（`const payload: NoticeTranslationPayload = await fetchNoticeTranslation(…)`：退回 `Promise<unknown>` 就过不了 `tsc --noEmit`，因为 tsconfig 含 `tests/**`），配运行期键集合断言（假 repo，不连库）。据此把 `favorite`/`translation`/`feedback` 三条从 C 升 A（登记不删——整块透出依旧静态不可见，只是债账从「没查过」变成「查过且有闸门」）。
  顺手记两条口径：`formatItems` 产出的是列名口径的内部行（`{...row, core_locked}`）**但不算违规**，因为收藏/搜索的路由都过了 `toNoticeListView`——先验证再下结论；`listNoticeFavorites` 的 `items: unknown[]` 同属抹平，已改成 `Array<Record<string, unknown>>` 并注明「对外契约由路由侧收」。
- **登记集能真删行的只有一种：把 mapper 改成约定名**。leads 两个出口（`GET /api/leads`、`POST /api/leads/log`）本来就在过隐私收窄 DTO，只是函数叫 `mapLeadForMemberView`——规则二只认 `*ViewOf` / `to*View` 这类后缀，名字不合约定就得一直占登记位。改名 `leadMemberViewOf` 后两行直接删掉（登记 36→34）；同法把供应商族 `mapSupplierRow`/`mapSupplierItems` 改成 `supplierViewOf`/`toSupplierListView`，再删两行（34→32，A11/B16/C5）。门禁由「靠人工登记」变成「自己看得出已收口」；配套自测 `约定名要真起作用` 钉住改名前拦、改名后放行，防止将来被改回 map 前缀。**mapper 命名不是风格问题，它就是静态面能看见的那唯一一点线索**，所以下次给视图函数取名直接按 `xxxViewOf` / `toXxxView` 走。
  但名字只能让门禁**不再报错**，不能保证键集合——所以删行必须同批补上真正钉住键的断言：`tests/unit/lib/services/leads.test.ts`（14 键）与 `tests/unit/lib/services/suppliers-view.test.ts`（25 键 + 嵌套无 snake + 降级不改变键集合）。没这两例，改名就只是把债从登记集赶进了黑房。
- **C 组不是「跑不了」，大分是「没必要花钱跑」（2026-10-28 第四批）**。剩下的 C 里三条拿到了证据：
  `ai-summary` 的键名不取决于是否触 LLM（服务出口只有一个 `AiSummaryResult`，缓存命中与生成完同走 `toResult`）→ 假 repo 打缓存那一路即可钉 10 键；
  `crm/chat/sessions/queue` 同理钉住路由两分支同 4 键，外加 repo 把 `ahead/total/avg_seconds` 映射为 camel 的那两例；
  `ai-match` 则根本不是「未实测」而是**真违规**：`MatchedSupplier` 直接带着 `pool_id`/`supplier_id` 上网，前端类型还照抄一遍。
  已改 `poolId`/`supplierId`（服务接口 + 排序 + 写缓存 + 前端类型 + `AiEvaluationPanel` 读取点）。
  **改名的坑在缓存**：`notice_ai_summaries.match_results` 里存的是上一版序列化 JSON，而 GET 回读是把 `parsed` 原样吐出。
  本仓禁 camel↔snake 桥接，所以走「版本闸」：命中缓存必须同时满足「有 isSelf」且「已是 supplierId」，
  否则当未命中重生成（宁可多跑一次用户 BYOK 的 LLM，也不把列名吐上网）；路由侧 GET 自己 parse 的那条路径加同一道闸。
  教训：整块透出的登记项不等于「大概没事」——它是唯一没人查过的地方，C 组逐条查下去真能挖出上网的列名。
- **C 组清零（2026-10-28 第五批）：「触外部网关」也不是挡箭牌**。最后两条（`training/orders` 建单、`training/orders/[orderNo]` 查单）用假 repo + 假 strategy 在进程内就能钉：`TrainingPaymentService.createOrder/queryOrder` 都是**显式列字段 return**，网关回传的 `pay_url`/`qr_code_url`/`provider_trade_no` 在方法内取成局部变量再装进 camel 键（无 `{...gateway}` 展开），所以不会把列名带上网。`tests/unit/lib/payment/training-orders-view.test.ts` 钉住建单 8 键、查单 4 键（三个分支：本地过期/已 paid 不查网关/网关回 paid 先履约），顺带钉住一个容易误读的行为：**履约用的是网关回传流水号，不是库里的旧值**。登记集现为 A16/B16/C0（共 32）；C 的位置留着，但新条目必须写清「为何拿不到证据」，而「能用假 repo 钉键集合的」不得再归进 C。
- **B 组收敛第一批：system 族（2026-10-28）——整块透出不只漏列名，也漏内部字段**。`/api/system/icp` 写的是 `json(icpCache)`，而 `icpCache = { bah, ts }`：`ts` 是模块级缓存的**内部时间戳**，被连带送上了网（前端只读 `data.bah`，没人依赖它）。现两个分支都改成显式字面量 `{ bah }` → 出口回到规则一能直接查得到的范围，登记删除。
  `/api/system/links` 本来就在做行→对象映射，只是内联在 `.map((r: any) => …)` 里（静态面认不出、还把行类型写成了 `any`）→ 抽出 `footerLinkViewOf(r: RowDataPacket)` 后登记删除，以后 SELECT 加列不会自动上网。
  两个端点都带模块级缓存，所以首次与 TTL 命中**两条出口各自都要测**（只测一条很容易让另一条漂移）：`tests/unit/app/api/system-view.test.ts` 钉住 4 键定形、额外列被挡住、命中分支不再查库、icp 两个分支都只出 `bah`。
  另存一条：`links` 的缓存命中出口 `json(linksCache.items)` 仍没法静态认出（它是模块级可变变量），已升到 A 而不是删掉——**能认出才删，认不出就如实登着**。
- **B 组收敛第二批：notice-search 两个聚合端点（2026-10-28）——探针只证一次，假 pool 单测才钉得住**。`notices/countries` 与 `notices/hot-topics` 的键名在 service 出口就定好了（SQL 别名 `cnt`/`name_zh` 在 `countries.ts`/`hot-topics.ts` 内已换成 `count`/`nameZh`），路由侧只能 `json(变量)`——按分层口径映射不该搬回路由，所以这两条是**升 A而不是删行**。
  取证用 `tests/unit/lib/services/notice-search-aggregates-view.test.ts`（假 pool 按 SQL 文本分派，两模块本身就导出了 `clearCountriesCache`/`clearHotTopicsCache` 供测试）：除键集合外还钉了两件本来只有探针知道的事——**国家计数归一后总量守恒**（写一个 `alias` 行不够：`country_aliases` 的查找键取自 `alias` 列，一种写法一行，否则那种写法的公告会被直接丢掉），以及**热门标签仍盯 `commodity_backbone`**（改回旧字典时这里先红）。
- **命名口径的另一个发现（未开工，待定）**：`/api/supplier-pool` 一行就把 `pool_id`/`supplier_id`/`has_qualification`/`created_at`
  直接下发（`SELECT p.id AS pool_id` 的 SQL 别名当响应键），前端 `settings/supplier-pool/page-client.tsx` 已在读 `item.pool_id`。
  它不在登记集里，因为出口形如 `json({ items: 变量 })`——正是规则二已声明的已知盲区（见下条），
  不是「已核过」。要治就按 supplier 族老路子：域内建视图 + 前端读取点同批改 + 键集合断言。
- **规则二自身的已知限制（不假装盖全）**：它拦 `json(变量)` 与 `json({ ...盲区源 })`，但**不拦 `json({ items: 变量 })` 这种「字面量包 opaque 值」**——items 里数组元素的键对静态面不可见。`/api/open/v1/engineering` 的 list/detail 就是这个形状
  （`items: rows` 直接透传列名，2026-10-28 之前门禁对它完全说不了）。这类只能靠端点级断言 + 探针发现。
  即使已改成 `items: 视图数组`，静态面依旧看不见它——**加了 mapper 不等于被门禁看见**，
  所以这个形状必须配路由级/视图单测。
- **开放 API（`/api/open/v1/**`）命名口径已定：与主站同走 camelCase（2026-10-28 用户选定「整族迁」）**。
  背景：只读探针实测 `engineering?stats=1` 在吐 `total_count/country_count/earliest_date/latest_date`，
  而同一外发面的 list/detail 本来就把列名直接透传（`items: rows`）——整块对外 API 都是 snake 风格。
  现在行→视图收在 `lib/services/open-api/view.ts`（显式列字段，新增列必须先登记才能出网），
  值一律原样透传。**查询参数不变**（`notice_type`/`deadline_from`/`deadline_to` 按口径仍 snake），
  所以对外只破在响应键名。
  **【破坏性变更·需通知已授权客户】响应键名对照**（basic 15）：`notice_type→noticeType`、
  `agency_full→agencyFull`、`published_date→publishedDate`、`deadline_ts→deadlineTs`、
  `estimated_value→estimatedValue`、`source_notice_id→sourceNoticeId`（`id/title/reference/agency/country/deadline/industry/status/priority` 不变）；
  pro 另 12：`description_cn→descriptionCn`、`bid_overview→bidOverview`、`supplier_conditions→supplierConditions`、
  `technical_hurdles→technicalHurdles`、`ai_products→aiProducts`、`ai_analysis→aiAnalysis`、
  `beneficiary_countries→beneficiaryCountries`、`registration_level→registrationLevel`、`source_url→sourceUrl`
  （`description/contacts` 不变）；stats 4：`total_count→totalCount`、`country_count→countryCount`、
  `earliest_date→earliestDate`、`latest_date→latestDate`。
  站内无读取方（已 grep 证实：这些键名仅出现在本域服务与路由）；**对外的接口文档（docs/收费资料 里的
  API 授权产品说明）仍需同步更新，那部分不在代码里**。

### 数据库列名对照表（② 的下游守卫）

② 的存量证明一件事：命名问题不从列名开始就治不完。全库核查（114 表 / 1378 列）后的结论是
**列名纪律本身良好**（`user_id` 30 列零别名、`supplier_id` 10 列零别名、`created_at` 72 / `updated_at` 48），
真正该钉住的是两条：

| 规则 | 口径 | 存量 |
|---|---|---|
| **BG1 同义同名** | 同含义 + 同类型 + 同单位 → 必用 canonical 列名；写别名即失败 | 确证别名仅币种一族（`currency` vs `currency_code`），冻结 1 列 |
| **BG2 后缀名实相符** | `_ts`=整数 epoch 秒、`_at`=DATETIME/TIMESTAMP/DATE、`_url`/`_uri`=字符列 | `_ts`/`_url` 零违规；5 个 `_at` 实存 Unix 秒，已冻结为技术债清单 |

门禁 `check-db-column-glossary.mjs`（`check:db-glossary`，已接 `npm run lint`）扫 `src`/`scripts`/`db/schema` 下的
CREATE TABLE **与 ALTER TABLE ADD/CHANGE COLUMN**（新增列的真实来路），自测三面必测。

- **已核实为不同含义、禁止合并的列族**（这些名字必须保持不同，强行“统一”即造 bug）：
  `deadline`(原文串) ≠ `deadline_ts`(epoch) ≠ `deadline_sec`(生成列 ms→s)；`published_date`(varchar 原文)
  ≠ `published_ts`；`country`(名) ≠ `country_code`(ISO 单码) ≠ `country_codes`(多码集)；
  `source`(provenance 来源渠道) ≠ `source_url`(链接) ≠ `host`(注册域) ≠ `platform_name`(归一规范名)；
  `notice_id`(外部编号，实测撞号) ≠ `notice_pk`(内部主键/服务表 1:1 锚点)。
- **不靠改列名治 ②**：宽表改名要走影子表蓝绿切换，且改名不会自动修好契约。存量列名不动，
  只要求新增列遵守本表；② 的收口点在**各域 mapper**。

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
