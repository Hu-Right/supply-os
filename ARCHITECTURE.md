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
| **②** 响应字段命名 | **响应实体字段用 `camelCase`**；请求参数与分页/元数据键允许 `snake_case`（`page_size`/`total`/`limit`/`next_cursor`… 见门禁内 `METADATA_KEYS`）。三条规则同走 `NextResponse.json(...)`/`Response.json(...)` 一面：规则一查**对象字面量键**（显式 `k:`、ES6 简写 `{ k, }`，以及 `const body = { … }; json(body)` 这种键在声明处的间接字面量）；规则二拦**整块透出**（`json(变量)` / `json({ ...盲区源 })`）——实参与其本地初始化式里没有视图 mapper 痕迹又未登记→ 当场失败；规则三拦**字面量包 opaque 值**（`json({ 键: 服务返回值 })`，含解构出口与 ES6 简写条目）——外层键看得见但值内部的键看不见，同样要么过约定名 mapper、要么登记（只排除分页/元数据键、举得出证的内建标量生产者、键写在文本里的 `rows.map(r => ({ … }))` 内联映射）。mapper 产出的键仍不在本静态面内，由分域迁移 + 路由级断言 + 只读探针覆盖 | `check-api-field-naming.mjs` | 显式 snake 键：递减白名单 68 项已**清零**（登记行全删）——auth 全域、supplier-diagnosis、learning/training/report-preview、claims/interest/unlock、crm/chat（消息 + 会话四处出口）、notices 全域（detail/preview/content/unified-search/stats）、payment/orders 建单与查单、解锁记录三端点、opportunities 与 awards 列表、membership 五端点整族均已迁 camelCase，新代码写 snake 键即失败。整块透出（2026-10-28 新规则暴露）：**登记 24 处**，全部为 A（已收视图 + 实测/断言）/ B 实测无 snake 但未收 mapper **已清零** / C 尚未实测 **已清零**。开放 API 已按（乙）整族迁 camel，于同日入库。字面量包 opaque 值（2026-10-28 新开的规则三）：**另登 32 项**（初开 36 项，2026-10-29 四处全部收口并删行），此面初开即扫出 4 处已知 snake 上网·待收口——**【丙】组已清零**。 |
| **③** 401 语义单一化 | `401` = 「未登录/需要认证（凭据缺失或过期，**可刷新**）」，业务码只允许 `EC_AUTH_REQUIRED`/`EC_USER_REQUIRED`/`EC_API_KEY_INVALID`/`EC_API_KEY_EXPIRED`；**会话已死与凭据被拒一律 403 + 专属码**：登录密码错→`EC_ACCOUNT_ISSUE`，refresh token 无效/过期/撤销→`EC_REFRESH_TOKEN_*`（均 403）。开放 API 的 `X-API-Key` 边界保留 401（标准 REST 语义，不经本刷新链路） | `check-api-401-semantics.mjs` | 已普查并归位：会话已死/凭据被拒的 5 处改 403（登录 2 处 + 刷新 3 处）；剩下的 401 发放点（requireUserKey / premium 需登录 / SSE 票券 / 开放 API Key 边界）全为认证语义，且码必须是允许集内的 `EC_` 常量（裸数字同判，与①同口径） |

- **为什么③要治本**：api-client 把 `res.status === 401` 当作「access token 过期 → 刷新重试，刷新失败即清凭据 + 登出」的信号。把「密码错误」「refresh token 已死」写成 401 会误触发刷新/登出链路（登录失败去刷一个新 session 根本没有的 token），且让 401 含义漂移。改 403 后**客户端行为不变**：`tryRefreshToken()` 对 `!res.ok` 一律返回 `null`，仍然清凭据 + 广播 `supply-os:unauthorized`。
- **递减白名单怎么减**：迁移一个端点 = 同批改掉前端读取点（`src/features/**`、wrapper）+ 删掉白名单对应行；门禁会在「登记项已不再命中」时打印待收敛提示，机器兜住「忘了删行」。
  自测不再绑真实存量：样本登记项由 `API_FIELD_NAMING_ALLOWLIST_EXTRA` 注入 fixture 子进程，
  否则每迁完一族都要回头改自测（payment/orders 迁走时就是这样把自测改红的）。
- **白名单清零 ≠ 债务清零（`...row` 展开与整块透出区）**：静态面原先只看得见 `json({ 显式键 })`（已覆盖显式 `k:` 与 ES6 简写 `{ k, }` 两类，简写曾漏过 report/preview 的 `total_report_chars`，现由自测钉住）；而全站有 30+ 个出口是 `NextResponse.json(变量)` 整块透出（repo 行 / 服务结果直接上网），门禁一个键都看不见。**2026-10-28 起这条盲区本身进门禁**（② 加规则二）：`json(变量)`、`json({ ...盲区源 })` 只要实参（或其本地 `const X = …` 初始化式）里没有视图 mapper 痕迹，就当场失败，除非登记在 `OPAQUE_ALLOWLIST`；反过来 `const body = { user_id: … }; json(body)` 这种「键在声明处」的间接字面量现在也被规则一查得到（行号指声明行）。登记集现状 **24 处**，按证据强度分组写明：A「已收视图 + 真库探针实测 snake 键 0」24 处、B「实测无 snake 键但未收 mapper」**已清零**、C「**尚未实测**」**已清零**（均 2026-10-28）。重出清单：`API_FIELD_NAMING_EMIT_OPAQUE=1 node scripts/gates/check-api-field-naming.mjs`（分组计数由 `runtime/count-opaque-groups.mjs` 复核）。
  **2026-10-28 又开了第三面**（规则三 `WRAPPED-VALUE`）：上面那些登记项只覆盖「整个响应体看不见」，
  而 `json({ list: rows })` 这种「字面量包一个服务返回值」两面都不报——两个真违规（资源库直透列名、
  认证响应体七键）就是从这道缺口流出去的。现第三面另有**递减登记集 32 项**（甲：值已收视图/出口已显式映射；
  乙：值是标量或 ID 数组；**丙：已知 snake 上网·待收口——已清零（均 2026-10-29）**：
  user/industry-prefs、training/landing、user/enterprise、training/orders/[orderNo]/participants
  四处全部过视图并删行，每处都有路由级集成测试钉键集合。
  重出清单：`API_FIELD_NAMING_EMIT_WRAPPED=1 node scripts/gates/check-api-field-naming.mjs`。
  规则二那条登记集靠两样东西继续收敛：
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
- **字段名之外还有一层「值从哪来」**（2026-10-29 升格为 [ADR-0015](docs/adr/0015-buyer-display-alias-only.md)）：
  `agencyI18n`（买家中文名）曾同时混入**聚合类别名**（「法国各机构」——`buyer_group` 的语义是按国家 +
  机构类型聚合，与“具体是谁”无关）与**模式合成头名**（`PHILIPPINE RECLAMATION管理局`），而前端读的是
  `agencyI18n || buyerName`，所以类别名直接占掉了买家名的位置。现全链（列表/详情/预览）**只认
  `agency_aliases` 表内登记过的译名**（判定式 `resolveAgencyDisplay().i18nFrom === "alias"`），
  未登记就不下发、前端回退真实原名（代价：卡片与详情约 99.7% 行显外文原名，这是主动取舍不是漏改）；
  `buyer_group` 的聚合语义保留，但不得流入买家展示字段。由
  `tests/integration/api-routes/notice-detail-agency.test.ts` 钉住（详情在表内无登记名时必须显式下发空串——
  解锁合并是 `{...preview, ...detail}`，缺键会残留上一次下发的名字）。
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
- **B 组收敛第三批：级联树族四条一次钉完（2026-10-28）**。`industries/facets`、`industries/tree`、`commodity/tree`、`commodity/tree/prefs` 四个端点共用同一类「行→选项」映射（列 `code / name_zh / name_en` → 键 `key / nameZh / nameEn`），所以一份 `tests/unit/lib/services/tree-options-view.test.ts`（8 例，假 repo / 假 pool）就能把四条登记项一次性升到 A。
  这类「一族共用一个形状」的写法比一个端点一个测试更值：除了键集合，还顺带钉住了两个**只在降级路径上才会发现的行为**——双语名全空的脏行直接丢（宁可不给选项，也不把 `UGT-I-xxxx` 当名称透到界面），以及非法节点码不查库直接回空（`prefs` 无偏好时给 `{l1Code:null, options:[]}`，而不是另一种结构）。
- **B 组收敛第四批：unified-search 信封显式列举（2026-10-28）——能把登记行真删掉的手段是「让盲区不成立」**。
  `GET /api/notices/unified-search` 写的是 `json({ ...result, items: toNoticeListView(result.items), page_size })`：
  编排器给 `UnifiedSearchResult` 加任何内部字段都会直接顶成响应键（服务改一次、wire 静默改一次）。
  改成显式列举信封后盲区消失，登记行**真删**（30→29，A23/B6/C0）——门禁自带「登记项已不再命中就提示删行」，
  所以忘删会被 `check-api-field-naming.mjs` 当场拦下。
  顺手扯掉一条自造的桥：spread 漏出来的 `pageSize` 与元数据口径的 `page_size` **同值双发**，
  前端 `json.pageSize || json.page_size` 就是在读这个重复。现分页元数据只发 `page_size`（与请求参数同名），
  同步改了 `NoticeResponse`、`useSearchResults` 读取链、样式冒烟样例（`serve-style-smoke.mjs`）——
  **同值别名就是 camel↔snake 桥，按红线不得保留**；键集合由 `tests/unit/app/api/notices/unified-search-gate.test.ts`
  新增的三例钉住（假编排器返回值里故意放了 `digest`/`meiliMs` 两个内部字段，验证它们上不了网）。
- **B 组收敛第五批：certifications 与 suppliers/stats（2026-10-28）——两条登记位一次真删，附送一个幻影字段**。两种收口手法各治一种形态：
  `/api/certifications` 是 `json(rows)`（repo 行直接上网，表列就是契约）→ 抽出约定名 `certificationViewOf(row: CertificationRow)`，
  静态面自己认出已收口→删行；`/api/suppliers/stats` 是 `json({ ...stats, registered })`→ 成功分支改成显式列举六个计数键，
  与降级分支硬编的那六个对齐（以前两路形状只靠肉眼对齐，改一边就飘）。登记 29→27（A23/B4/C0），
  证据是 `tests/unit/app/api/supplier-catalog-view.test.ts`（假仓储，不连库）：多余列/内部字段被挡住、脏值归一（`id: "7"`→7、`name: null`→`""`）、
  降级分支与成功分支键集合完全一致。
  拆登记时顺带挖到一条**前端幻影字段**：`features/training/api.ts` 的 `CertificationRefItem` 挂着 `title_zh`/`title_en`，
  而 `supplier_certifications` 表只有 `id / name / sort_order / is_active / created_at`（端点也只 SELECT `id, name`）——
  两处读取点写的 `item.name || item.title_zh || item.title_en || String(item.id)` 永远只会读到第一项。
  已删类型字段并拆掉两条回退链（这跟 ai-match 的 `pool_id` 是同一个病根的两面：一边是服务把列名吐上网，一边是前端凭空镜像了一排列名）。
- **B 组收敛第六批：三个「路由把服务出口结构直接当响应体」的端点（2026-10-28）——登记 27→25（A24/B1/C0）**。这批形态与前面不同：不是列名上网，而是服务类型加一个字段 = wire 多一个对外键。处理按分层分了两类：
  `catalog/country-name-map`（`json(maps)` → `{countries, regions, zhToEn}`）与
  `learning/materials/[materialId]/content`（`json(payload)` → `{contentZh, contentEn, fileUrl, fileName}`）
  路由本来就在透一个固定形状的对象，列举不搬动任何映射→盲区不成立→**登记真删**；
  `user/keyword-groups` 的映射在仓储出口（`KeywordGroupsRepo.listByUser` 已把 `created_at/updated_at` 换成 camel
  并解析 JSON terms），路由要列举就得给数组元素再写一份 mapper——那是把映射搬回路由，违反分层→**只升 A、不删行**。
  证据：`tests/unit/app/api/passthrough-envelope-keys.test.ts`（7 例，假服务 / 假仓储）——内部字段被挡住、
  `fileUrl: null` 仍占位（前端据此判有无附件，不能改成缺键）、付费墙 403 仍走错误 envelope、
  无权益时 `entitled:false + groups:[]` 而不是 403（锁定态渲染靠它）。
  顺带记一条命名事实：`KeywordGroupRow` 名字叫 Row，但内容已经是对外视图（五键全 camel）——
  本轮只钉住键集合未改名（改名为 `*View` 不会让静态面多看见任何东西，不减少登记）。
- **B 组清零：payment/orders 建单信封（2026-10-28 第七批）——登记 25→24，整块透出登记位全为 A**。
  这是最后一条 B，也是最该收的一条：`json({ ...result, payUrl, qrCodeUrl, paymentMode })` 里的
  `result` 来自**三条不同的 createOrder**（会员单 / 学习资料·打包 / 增值服务），而声明写的是
  `let result;`（无类型）——任何一条服务加字段都会直接上网，而 tsc 连这个关系都看不见。
  现在路由 `let result: OrderInfo` + 按契约逐键列举（11 键）：**显式标类型本身就是第二道收益**，
  三个服务出口现在都被 OrderInfo 当场校验（少给必填键就编译失败，不再靠人肉眼对齐形状）。
  证据 `tests/unit/app/api/payment-orders-create-envelope.test.ts`（5 例，假支付服务 + 假二维码，不打网关）：
  服务返回值里故意放的 `gatewayRaw`/`dbId`/`risk_flag` 上不了网；未提供的可选键不造 null 占位；
  `qrCodeUrl` 服务没给时仍占位（前端据此判有无二维码）；支付宝通道 `payUrl` 换成本站 redirect、
  缺二维码 500 专属码；live 选未开通渠道 400 且不建单。
  同批跑过 `tests/integration/api-routes/payment-orders*.test.ts` + `service-order.test.ts`（9 例全绿）。
  **写这类断言时记住：`Array#sort()` 按 UTF-16 码点，`payUrl < paymentMode`、`provider < qrCodeUrl`——
  同一坑本批踩了两次，现在把码点顺序写成注释并抽了共用常量。**
- **「字面量包 opaque 值」盲区首例已治：供应商资源库两端点（2026-10-28）——登记集之外的真违规**。
  `GET /api/user/supplier-pool` 以前是路由 `new UserSupplierPoolRepo()` 后 `json({ list: rows })`，
  于是四个列名/SQL 别名直接当对外键：`pool_id` / `supplier_id` / `has_qualification` / `created_at`；
  `/api/user/supplier-pool/search` 同样直透 `in_pool`（而同一文件的 POST 早就发 `poolId`/`supplierId`——
  一个端点内两套口径比全 snake 更易误读）。现已在 `lib/services/supplier-pool.ts` 建
  `PoolSupplierView` + `poolSupplierViewOf` / `toPoolSupplierListView` / `listPoolSupplierViews`
  与 `PoolCandidateView` + `poolCandidateViewOf`（值原样：`hasQualification` 仍 0/1、`notes` 仍可为 null），
  前端读取点同批改（`settings/supplier-pool` 的 types.ts + page-client + PoolItemRow + AddPanel，**不做桥接**）；
  取数也从路由收回 service（顺手消掉一处「路由直连仓储」），键集合由
  `tests/unit/app/api/supplier-pool-view.test.ts`（5 例，假仓储）钉住。**两个恒为空串的字段已写进视图注释**：
  SQL 里写的 `'' AS industry`，所以前端的 `item.industry && …` 分支实际不会渲染（属产品数据链路缺口，不是命名问题）。
- **盲区第二例已治：认证响应体本身是 snake（2026-10-28 第八批）——登记集之外的真违规，比上批严重**。
  探针先量到 4 处候选，动手才发现 `buildUserResponse` 返的对象自己就带着七个列名键：
  `has_subscription` / `account_status` / `supplier_id` / `supplier_industry_id` / `supplier_industry` /
  `phone_verified` / `email_verified`，被 `json({ user: payload })` 包着发到 **login/register/profile/reset-password/user
  五个出口**（不是探针估的三处）。规则一只检查**路由**那个字面量（只有 `user` 一键，合法），
  所以这批键改了表、改了仓储、改了前端都没人报——一行未露。现已全部改 camelCase，
  前端 4 个读取点同批改掉（`AuthContext` 的 isVip 判定、`useEmailBinding`、`usePhoneBinding`、
  `SupplierProfilePage` 的归属判定）**不做桥接**；`types/auth.ts` 镜像同口径。
  键集合由 `tests/unit/lib/services/auth.test.ts` 新增的定形例钉住（11 键列举 + 「带下划线的键必须为零」）。
  三点如实记录：① `supplierIndustryId`/`supplierIndustry` 恒为 null（字段已退役），本批只改名不删键，
  裁剪留给产品裁定；② 服务端另发 `accountStatus`，站内无消费方，所以前端类型**有意不声明**它（不给幻影字段开口子）；
  ③ 旧 localStorage 快照存的是 snake 键，启动恢复时 `isVip` 会临时算作 false，直到 `refreshAuth` 拿新响应覆盖
  （代码路径如此，**未做浏览器实测**，DB 隧道仍断）。
- **命名门禁新增规则三「字面量包 opaque 值」（2026-10-28 第九批）——登记集 24 处之外又开一面，当场扫出 4 个真违规**。
  之前的离线探针（`runtime/probe-wrapped-opaque.mjs` v2）量的【80 处 / 22 处】是启发式计数（只按变量名长相圈“值得人工看”），不能当判定；
  本批把它做成门禁硬规则：信封是字面量，而某个**浅层条目**的值是个裸标识符（含 ES6 简写），
  且该标识符的声明式是一次调用（含 `const { payload } = await …` 这种解构出口）→ 必须过约定名 mapper
  或登记。只排除举得出证的不携带者：分页/元数据键、内建标量生产者（`Math./Number/String/Boolean/clampLimit/JSON.stringify/…searchParams.get()`）、
  初始化式本身就是字面量、以及 `rows.map(r => ({ … }))` 这种**键写在文本里**的内联映射
  （后者顺带按规则一再查一遍：规则一原本只看 `json(…)` 括号内，映不到 map 回调）。
  扫出来共 **36 项**（已全部登记，含逐条依据；2026-10-29 四处收口后现 **32 项**），分三组：
  【甲】值已收视图/出口已显式映射（认证五出口、资源库两端点、开放 API 详情、订单列表、
  报价两列表、smart-infer/official词组/learning 列表/notifications/licenseChange 等）；
  【乙】值是标量或 ID 数组（无键可漏，登记只为「以后改成对象」当场报错）；
  **【丙】已知 snake 上网·待收口**（初开 4 处，**2026-10-29 四处已全清**），本面上线前无人知晓：
  ① ~~`GET /api/user/enterprise` 的 `{ enterprise: row }`~~ **已收口（2026-10-29）**：行是
  `PORTAL_COLUMNS` 的 31 个列名键（不是旧注释算的 30；其中 15 个真带下划线，剩下 16 个单列名
  camel/snake 同形），出口改走 `supplierEnterpriseViewOf`（`lib/services/enterprise/view.ts`，改名复用
  `shared/utils/case-keys`，不写第三份规则）。**真正的伤是类型抹平**：前端契约一直写
  `EnterpriseInfo = Record<string, unknown>`，所以 tsc/门禁/探针三路都看不见这批列名键——现已改成
  31 键具名镜像当编译期闸门（`sv(row, key)` 也从任意字符串收束成 `keyof EnterpriseInfo`，写错键名编译不过）。
  读写不对称是故意的：**表单字段 key 与 PUT/POST body 仍用列名**（请求侧允许 snake），只在
  `EnterpriseEditForm` 回填那一道用 `toCamelKey` 换一次键，不另设对照表。
  顺带治到一个双面共用漏口：`classifyEnterpriseBindState` 被前端（响应 camel）与服务端
  `enterprise-binding.ts`（DB 行 snake）同时调用——改成具名 camel 入参后，服务端两处**在各自边界显式换键**，
  而不是给分类器加「两种键形都认」的入参（那就是被禁止的双口径）；无行仍走 none、不得传空对象。
  ② ~~`GET /api/training/landing` 的 `{ course }`~~ **已收口（2026-10-29）**：`training_courses` 12 列与
  `training_schedules` 11 列均为 `SELECT *`，出口改走 `trainingCourseViewOf` / `trainingSchedulesViewOf`，
  按前端已声明的契约显式列举（课程 8 键 / 期次 8 键），未声明的 `sort_order`/`status`/`created_at`/
  `updated_at`/`course_id` 从此不上网（库里真有行在发：实测 1 行 active 课程 + 5 行期次，【丙】组里
  唯一有数据可达的一处）；5 个读取点 + 1 个组件测试夹具同批改完、不做桥接；
  旧三元内联形状（静态面看不见）一并消除，schedules 现在也是可见的 mapper 调用。
  ③ ~~`GET /api/training/orders/[orderNo]/participants` 的 `{ participants }`~~ **已收口（2026-10-29）**：
  `SELECT * FROM training_participants` 整行 11 列改走 `trainingParticipantsViewOf`，只发契约里的 7 个字段
  （`id`/`order_id`/`created_at`/`updated_at` 行元数据不上网）。隐私口径已核：该接口只能读自己订单的
  名单（路由校 `user_id`），姓名、电话与邮箱都是提交人自己的回显，正当。表单状态与 POST 体改用
  `ParticipantInput`（仍列名键）与响应类型 `TrainingParticipant`（camel）分开，避免“改名”把写入口径带走。
  真库实测两表 0 行（生产无数据可达），所以键集合由代码侧集成测试钉（“0 行”不构成不切的理由：面还在网上）。
  **本轮一处误判已纠正**：旧记录把 `email` 写成「幻影字段（表里没这一列）」，是从仓储 INSERT 的 7 列
  反推表结构得出的——只读探针实测该列存在（`varchar(200)`，baseline:2298）。缺陷不是「前端多写了个假字段」，
  而是「列在、输入框在、写入口不在」：用户填的学员邮箱自上线起被静默丢弃（证书发放需要它）。
  本批两头补齐（`saveParticipants` 的 INSERT + `ParticipantRow` 行类型 + 视图下发），INSERT 形状由
  `tests/unit/lib/repos/training-repo-participants.test.ts` 钉（列清单 ↔ `?` 个数 ↔ 取值数组同批增减）。
  **教训**：判定「这一列到底存不存在」只能走 `information_schema` 探针或 baseline，不得以调用方 SQL 的列清单为凭。
  ④ ~~`GET /api/user/industry-prefs` 的 `{ prefs }`~~ **已收口（2026-10-29）**：出口改走
  `industryPrefsViewOf` 出 `{ commodityCode, updatedAt }`（真库实测原为 2 个列名键），前端
  `core/api/industry-prefs.ts` 的镜像与 3 个读取点同批改完、不做桥接；登记行已删，
  wire 键集合由 `tests/integration/api-routes/user-industry-prefs.test.ts` 钉住。
  **POST 入参仍是 snake `commodity_code`**——红线②只约束响应实体字段，请求侧口径不变。
  跑具：`tests/gates/check-api-field-naming.test.mjs` 新增 5 例（带标签/简写、解构出口、
  内联映射两面、已收口不误伤、与规则二不重报），共 19 例全绿。
  排除项为什么不用变量名启发式：v2 探针的教训——名称启发既漏（`{ list: rows }` 名字不似列表）
  又误（`{ materialIds }` 其实是 string[]）；现在只排除类型上举得出证的，剩下的全部要登记。
- **规则二与规则三的分工（不假装盖全）**：规则二拦 `json(变量)` 与 `json({ ...盲区源 })`（整个响应体看不见），
  规则三拦 `json({ 键: 变量 })`（外层键看得见、值内部的键看不见）。两面都用「约定名 + 递减登记集」收敛，
  登记键不重叠（`rel#变量` vs `rel#键`），`json(变量)` 不会重复报成第三面（有回归用例钉着）。
  仍盖不到的两个形状：① 值写成三元/短路等表达式（`json({ schedules: course ? await listSchedules(…) : [] })`）；
  ② 嵌套层内部的键（规则一只查 `json(…)` 括号内与已解析到的字面量，map 回调本批已补）。
  `/api/open/v1/engineering/[id]` 的 `{ item }` 现在也占了登记位（视图早先已收在 `lib/services/open-api/view.ts`）；
  **加了 mapper 不等于被门禁看见**，所以这个形状仍必须配路由级/视图单测。
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
