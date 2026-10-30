import path from "node:path";
import {
  scanRoot,
  relOf,
  readText,
  collectRouteFiles,
  callSites,
  lineOf,
  matchParen,
  reportAndExit,
  staleAllowlistEntries,
} from "./lib/api-contract.mjs";

/**
 * 架构红线守卫：API 响应字段命名规范（② 命名统一，2026-10-27）。
 * @see ARCHITECTURE.md「API 契约规范（三条红线）」——请求参数与分页元数据用 snake_case，实体字段用 camelCase
 *
 * 背景：DB 列多为 snake_case，历史上有 route 把原始列（如 notice_id / title_zh /
 *   refresh_token）直接写进响应对象字面量，与「实体字段 camelCase」规范相悖，前端被迫混用。
 *   全站普查：route.ts 响应键 camelCase 约 1008 处、snake_case 约 173 处——camel 已是主序。
 *   本门禁把存量 snake 实体键冻结为「递减白名单」，新代码在响应字面量里写 snake 键即失败，
 *   随各域迁移（含同步前端读取点）逐条删行，最终归零。
 *
 * 精确口径：静态检查 route.ts 里 `NextResponse.json({...}) / Response.json({...})` 的
 *   **对象字面量键**（分页/元数据白名单键豁免），两条规则同走一面：
 *   规则一 拦显式 snake 键（含 `const body = { … }; json(body)` 这种间接字面量：
 *     响应体变量的键名在声明处，不在调用括号里，旧版完全看不见）；
 *   规则二 拦「整块透出」（`json(变量)` / `json({ ...row })`）——这种出口静态面看不见键，
 *     必须过视图 mapper 或登记递减清单（登记集见 OPAQUE_ALLOWLIST，含「已实测/待核验」分组）；
 *   规则三 拦「字面量包 opaque 值」（`json({ list: rows })`，rows 来自一次服务调用）——
 *     外层键看得见、值内部的键看不见，两面都漏过（登记集见 WRAPPED_ALLOWLIST）。
 *   mapper 产出的键仍不在静态面内（由分域迁移 + 端点级断言 + 只读探针覆盖）。
 *
 * 扫描/报告/白名单卫生均走共享骨架 `lib/api-contract.mjs`（四条 API 契约门禁同一口径）。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_CONTRACT_SCAN_ROOT=<path>  把扫描根换到 <path>（自测 fixture 用；默认仓库根）
 *   API_FIELDNAMING_EMIT_SEED=1    导出当前全部显式 snake 键（造初白名单用）
 *   API_FIELD_NAMING_ALLOWLIST_EXTRA=a#key,b#key  追加显式 snake 键登记项（仅自测用；让 fixture
 *     自带样本存量项，不再绑定真实白名单——否则每迁完一族都要回来改 fixture）
 *   API_FIELD_NAMING_OPAQUE_EXTRA=rel#var  追加「整块透出」登记项（仅自测用，同上理由）
 *   API_FIELD_NAMING_EMIT_OPAQUE=1  导出当前全部「整块透出」出口（造初登记清单用）
 *   API_FIELD_NAMING_WRAPPED_EXTRA=rel#key 追加「字面量包 opaque 值」浅层条目登记项（仅自测用）
 *   API_FIELD_NAMING_EMIT_WRAPPED=1 导出当前全部「字面量包 opaque 值」浅层条目（造初登记清单用）
 */

// 合法保留 snake_case 的响应元数据/分页键（规范允许 snake，非实体字段）。
const METADATA_KEYS = new Set([
  "page", "page_size", "per_page", "current_page", "total", "total_pages", "page_count",
  "limit", "offset", "count", "has_more", "has_next", "next_cursor", "prev_cursor",
  "order_by", "sort_by", "data_start", "data_end",
]);

// 递减白名单（`<相对 route.ts>#<snake 键>`）：存量显式 snake 响应键，迁移一个删一行；新增不得进入。
// 2026-10-27：② 存量已归零——opportunities 列表最后一个显式 snake 键（source_url 脱敏位）
// 改走行→camel 视图（items.map(toOpportunityListItemView)），不再靠字面键。
const DEFAULT_ALLOWLIST = new Set([
  // notices 全域（detail 12 项 + preview 6 项）与 content（2 项）已于 2026-10-27 迁完：
  // 行→视图统一走 lib/services/notice-public/view.ts（机械改名，值原样透传），
  // 响应契约由 types/procurement.ts 的 camelCase 字段定义，不再镜像列名。
  // preview 故意不调 mapper：它是付费墙，只发已登记的 8 个键（mapper 是改名不裁剪）。
  // payment/orders 的 pay_url / qr_code_url / payment_mode 已于 2026-10-27 随支付建单查单
  // 整族迁 camelCase（四服务响应类型 + 三端点 + 弹窗镜像一起改，不半截）。
]);

// 自测追加项（见文件头）：只影响本次进程，不改真实存量。
const ALLOWLIST = new Set([
  ...DEFAULT_ALLOWLIST,
  ...(process.env.API_FIELD_NAMING_ALLOWLIST_EXTRA || "")
    .split(",").map((s) => s.trim()).filter(Boolean),
]);

/**
 * 递减登记集（`<相对 route.ts>#<变量名或盲区展开源>`）：「整块透出」的响应出口。
 *
 * 为什么要单开这一面：规则一只看得见 `json({ 显式键 })`，而全站有 30+ 个出口是
 * `NextResponse.json(变量)`（或 `json({ ...服务结果 })`）——响应体就是 repo 行 / 服务结果，
 * 静态面一个键都看不见。真实取证跑过一轮（只读探针），当时 8 个端点在吐 snake 键；
 * 它们已逐个收进 mapper。剩下的登记项含义很具体：「此处整块透出，已核验或未核验」。
 *
 * 不拦的形态：① 键名全在字面量里（直接写或本地变量里间接写，两者都被规则一查过）；
 * ② 实参（或它的本地 `const X = …` 初始化式）里有 mapper 痕迹（*ViewOf / toCamel*）；
 * ③ 展开源本身是视图 mapper（`{ ...toNoticeView(row) }`）；
 * ④ 已在本清单登记的存量。新写 `json(变量)` 且没过 mapper → 当场失败。
 *   （mapper 痕迹是名字约定不是保证；目的不是猜准，是让新增的整块透出必须被看见。）
 */
const DEFAULT_OPAQUE_ALLOWLIST = new Set([
  // 【A 已收视图·真库探针实测 snake 键 0】路由直接透传服务结果，类型层已是 *View。
  // awards 三端点走 lib/services/awards/view.ts；解锁记录走各自视图；notices/stats 走
  // noticeStats 视图（`...stats` 是共享缓存对象，路由只补两个 camel 日新增键）；
  // 支付查单走 QueryPipelineResult（前序支付族迁移探针实测）。
  "src/app/api/awards/route.ts#result",
  "src/app/api/awards/stats/route.ts#stats",
  "src/app/api/awards/top/route.ts#result",
  "src/app/api/notices/stats/route.ts#stats",
  "src/app/api/notices/unlocks/route.ts#rows",
  "src/app/api/opportunities/unlocks/route.ts#unlocks",
  "src/app/api/payment/orders/[orderNo]/route.ts#result",
  // 开放 API engineering stats：2026-10-28 实测发现 4 个 snake 键（total_count 等）后，
  // 整族收进 lib/services/open-api/view.ts（item 27 键 + stats 4 键，值原样透传），
  // 证据是路由级单测 tests/unit/lib/services/open-api/view.test.ts（不依赖库）；
  // 运行期 HTTP 取证本轮未做（隧道断开），所以进 A 的依据是 mapper + 单测，不是探针。
  "src/app/api/open/v1/engineering/route.ts#stats",
  // 公告详情侧三出口（收藏 toggle / 按需译文 / 推荐反馈）：本批不是靠探针，而是先把
  // 「看不见」变成「可查」——上一版 fetchNoticeTranslation 把返回类型抹成 Promise<unknown>、
  // submitNoticeFeedback 抹成 Record<string, unknown>（还带一次 as unknown as 双断言），
  // 于是类型层这道唯一兜底被自己拆掉。现恢复具名契约
  // （NoticeTranslationPayload / FeedbackResult / { favorited: boolean } ），
  // 并用 tests/unit/lib/services/notice-detail-contracts.test.ts 钉住键集合（假 repo，不连库）。
  "src/app/api/notices/[id]/favorite/route.ts#result",
  "src/app/api/notices/[id]/translation/route.ts#result",
  "src/app/api/notices/feedback/route.ts#result",
  // system/links 的缓存命中分支：数组本体由同文件的 footerLinkViewOf 产出，
  // 首次与命中两个出口的形状由 tests/unit/app/api/system-view.test.ts 钉住（假 repo，不连库）。
  "src/app/api/system/links/route.ts#linksCache.items",
  // notice-search 两个聚合端点（国家分布 / 热门标签）：服务出口是显式字面量映射
  // （SQL 别名 cnt / name_zh 在 countries.ts 与 hot-topics.ts 内就换成了 count / nameZh），
  // 但路由侧只能 json(变量)——键集合现由 tests/unit/lib/services/notice-search-aggregates-view.test.ts
  // 钉住（假 pool）：两项键定形、多余列名不上网、国家计数归一后总量守恒。
  "src/app/api/notices/countries/route.ts#countries",
  "src/app/api/notices/hot-topics/route.ts#data",
  // 级联树族四条（industries/facets、industries/tree、commodity/tree、commodity/tree/prefs）：
  // 三者共用同一行→选项映射（code / name_zh / name_en → key / nameZh / nameEn），
  // 键集合、脏行取舍（双语全空则丢）与非法码不给选项，现由
  // tests/unit/lib/services/tree-options-view.test.ts 钉住（假 repo / 假 pool，不连库）。
  "src/app/api/commodity/tree/prefs/route.ts#resolved",
  "src/app/api/commodity/tree/route.ts#options",
  "src/app/api/industries/facets/route.ts#sections",
  "src/app/api/industries/tree/route.ts#options",
  // AI 与客服三出口原停在 C「触付费 LLM / 库里无数据，探针跑不了」，但键名其实不必花 LLM 就能钉：
  // 服务出口只有一个形状，用假 repo 打缓存命中那一条路径即可。
  //   notices/[id]/ai-summary → AiSummaryResult 10 键（tests/unit/lib/services/ai-summary-view.test.ts）；
  //   crm/chat/sessions/queue → 路由两分支同 4 键 + repo 将 ahead/total/avg_seconds 映射为 camel
  //     （tests/unit/app/api/chat-queue-view.test.ts）。
  // notices/[id]/ai-match 不是「未实测」而是**真违规**：MatchedSupplier 带 pool_id/supplier_id 上网（前端还照抄）。
  // 已改 poolId/supplierId，并把缓存版本闸收到同一口径（旧列名缓存不命中、重生成，不做 camel↔snake 桥接）。
  "src/app/api/crm/chat/sessions/queue/route.ts#info",
  "src/app/api/notices/[id]/ai-match/route.ts#result",
  "src/app/api/notices/[id]/ai-summary/route.ts#data",
  // 支付两条原停在 C「触外部网关，探针跑不了」，但键名同样不必打真网关：
  // TrainingPaymentService.createOrder / queryOrder 都是显式列字段 return（网关回传的
  // pay_url / qr_code_url / provider_trade_no 在方法内取成局部变量再装进 camel 键，无 {...gateway} 展开）。
  // 因此用假 repo + 假 strategy 在进程内钉住键集合（tests/unit/lib/payment/training-orders-view.test.ts，
  // 不连库、不打网关、不写数据）；该文件同时钉住「履约用的是网关回传流水号而非库内旧值」。
  "src/app/api/training/orders/[orderNo]/route.ts#result",
  "src/app/api/training/orders/route.ts#result",
  // 我的词组列表：映射在仓储出口（KeywordGroupsRepo.listByUser 已把 created_at/updated_at 换成
  // camel 并解析 JSON terms），但路由侧只能 `json(data)`，数组元素键在静态面不可见。
  // 键集合由 tests/unit/app/api/passthrough-envelope-keys.test.ts 钉住（假仓储，不连库）：
  // 有权益时 { entitled, groups[5 键] }，无权益时 entitled:false + 空数组而不是报错。
  "src/app/api/user/keyword-groups/route.ts#data",
  // 【B 字段命名 sweep 实测无 snake 键·但仍未收 mapper】2026-10-28 已清零。
  // 以后落进本组的新条目必须写明「为什么不能直接收口」：能改成约定名 mapper、
  // 或能把信封显式列举的，都不属于 B——直接删行并把键集合写进单测。
  // 已删行（均为 2026-10-28，按手法归类）：
  //   约定名收口：leads 两条（mapLeadForMemberView → leadMemberViewOf，路由本来就在过隐私收窄 DTO，
  //     规则二只认 *ViewOf / to*View 这类约定名）、suppliers 两条（mapSupplierRow/mapSupplierItems →
  //     supplierViewOf / toSupplierListView）、certifications（`json(rows)` → 抽 certificationViewOf）；
  //   显式列举信封：system/icp（不再把内部缓存时间戳 ts 送上网）、system/links 首次出口（抽出
  //     footerLinkViewOf，内联 (r: any) 映射不再隐身）、notices/unified-search（不再 `json({ ...result })`，
  //     并撤掉同值双发的 pageSize）、suppliers/stats（成功分支六键与降级分支硬编对齐）、
  //     catalog/country-name-map（{countries, regions, zhToEn}）、learning/materials/[materialId]/content
  //     （{contentZh, contentEn, fileUrl, fileName}）、payment/orders 建单（不再 spread 三条不同
  //     createOrder 的结果，改按 OrderInfo 逐键列举，并给 `let result` 显式标上契约类型）；
  //     后四条的键集合由 tests/unit/app/api/passthrough-envelope-keys.test.ts 与
  //     tests/unit/app/api/payment-orders-create-envelope.test.ts 钉住。
  // 已升 A（映射在 service/仓储出口，路由只能 `json(变量)`，删行会等于假装静态面看见了）：
  //   awards 族、notices/stats与解锁记录、open/v1/engineering、公告详情三出口、system/links 缓存命中、
  //   notice-search 两个聚合、级联树族四条、ai 与客服三出口、training 订单两条、user/keyword-groups
  //   （映射在 KeywordGroupsRepo.listByUser：created_at/updated_at 已换 camel 并解析 JSON terms，
  //     数组元素键无法在路由侧列举，键集合由 tests/unit/app/api/passthrough-envelope-keys.test.ts 钉住）。
  // 2026-10-28 只读探针实测无 snake 键（runtime/probe-opaque-c-group.ts，走与路由同一条生产链）：
  // 当时以下 5 个原本「未实测」的项拿到真实响应键集合但未收进 *ViewOf 视图，所以先登 B；
  // 其中 industries/tree、suppliers/[id]、suppliers/stats、notices/unified-search、
  // learning/materials/[id]/content 均已在本日后续处理（见上面两组归类）。
  // 【C 尚未实测】2026-10-28 已清零：原本剩下五条全部拿到进程内断言证据并升 A。
  // 下一批整块透出落进本组时，必须逐条写明「为什么拿不到证据」
  // （写路径 / 触付费 LLM / 触外部网关 / 库里无数据），不得笼统当成「应该没事」；
  // 能用假 repo 在进程内钉键集合的不属于 C——先钉完再登 A。
]);

// 自测追加项（见文件头）：只影响本次进程，不改真实登记存量。
const OPAQUE_ALLOWLIST = new Set([
  ...DEFAULT_OPAQUE_ALLOWLIST,
  ...(process.env.API_FIELD_NAMING_OPAQUE_EXTRA || "")
    .split(",").map((s) => s.trim()).filter(Boolean),
]);

/**
 * 第三面登记集（`<相对 route.ts>#<浅层键名>`）：「字面量包 opaque 值」的出口。
 *
 * 为什么要单开第三面（2026-10-28）：规则二只看整个实参，规则一只看键名，于是
 * `json({ list: rows })` 这种写法两面都不报——外层键 `list` 在字面量里（合法 camel），
 * 而值内部的键完全来自一次服务/仓储调用（静态面不可见）。真实代价已经吃过两次：
 *   · 供应商资源库两个 GET 直透 `pool_id`/`supplier_id`/`has_qualification`/`created_at`；
 *   · 认证响应体七个 `users.*` 列名键被 `{ user: payload }` 包着上了五个出口。
 * 两边都不是「门禁报了没改」，而是「门禁一个字没说」。
 *
 * 不拦的形态（只排除「确定不可能携带键」的值，不靠变量名猜安不安全）：
 *   ① 键名已在 METADATA_KEYS（分页/元数据按口径允许 snake，本来就是标量位）；
 *   ② 值由内建标量生产者产出（Math./Number/String/Boolean/clampLimit/JSON.stringify 等，不可能带键）；
 *   ③ 声明式里有 mapper 痕迹（*ViewOf / toCamel* / to*View）；
 *   ④ 声明式本身是对象/数组字面量（键在静态面可见，已由规则一查过）；
 *   ⑤ 已在本清单登记的存量。
 *   新写 `json({ 键: 服务返回值 })` 且没过 mapper → 当场失败，要么收视图、要么登记并写清依据。
 */
const DEFAULT_WRAPPED_ALLOWLIST = new Set([
  // 【甲 已收视图·键集合由类型或单测钉住】值来自一个已定形的出口（不是「看起来没事」）。
  // 认证五出口共用同一响应体：AuthUserResponse 已于 2026-10-28 逐键改 camel，
  // 键集合由 tests/unit/lib/services/auth.test.ts 的定形例钉住（11 键 + 「带下划线的键必须为零」）。
  "src/app/api/auth/login/route.ts#user",
  "src/app/api/auth/profile/route.ts#user",
  "src/app/api/auth/register/route.ts#user",
  "src/app/api/auth/reset-password/route.ts#user",
  "src/app/api/auth/user/route.ts#user",
  // 供应商资源库两端点：行→视图收在 lib/services/supplier-pool.ts（poolSupplierViewOf /
  // poolCandidateViewOf），证据 tests/unit/app/api/supplier-pool-view.test.ts（假仓储）。
  "src/app/api/user/supplier-pool/route.ts#list",
  "src/app/api/user/supplier-pool/search/route.ts#candidates",
  // 供应商目录分页端点：items 是 Supplier DTO 视图（行→视图收在 lib/services/
  // suppliers-directory.ts toSupplierListView，键集合由 src/types/supplier.ts 契约钉住）。
  // 2026-10-30 RSC 直出改造：视图装配上移服务层，路由只剩转发，故走本登记面。
  "src/app/api/suppliers/route.ts#items",
  // 开放 API 详情：EngineeringItemView（lib/services/open-api/view.ts 显式列字段），
  // 证据 tests/unit/lib/services/open-api/view.test.ts。
  "src/app/api/open/v1/engineering/[id]/route.ts#item",
  // 服务/仓储出口已做显式列映射（键名在出口处就换成了 camel，不是靠名字担心）：
  //   smart-infer → CommodityInferCandidate（code/nameZh/nameEn/level/score/path）；
  //   keyword-groups/official → OfficialKeywordGroupsRepo.listEnabled 内将
  //     category_code/sort_order 换成 categoryCode/sortOrder 并解析 terms；
  //   learning/materials → listMaterials 内 map 出显式字面量（premium 正文不下发）；
  //   notices/[id]/detail → PlatformInfo = { canonical, code, zh }（本批只登记，没改该路由）；
  //   notifications → NotificationItem（isRead/createdAt）；
  //   license-change → 服务内显式将 reject_reason/created_at 映成 rejectReason/createdAt。
  "src/app/api/commodity/smart-infer/route.ts#candidates",
  "src/app/api/keyword-groups/official/route.ts#groups",
  "src/app/api/learning/materials/route.ts#materials",
  "src/app/api/notices/[id]/detail/route.ts#platform",
  "src/app/api/notifications/route.ts#items",
  "src/app/api/user/enterprise/route.ts#licenseChange",
  //   rfq 两条报价列表：my-quotes 的 SQL 已用 AS camel 别名（quoteId/rfqId/leadTimeDays…）
  //   且声明为 MyQuoteRow；[id]/quotes 的 buyer 列表声明为显式内联类型（supplierUserId/deliveryTerms…）。
  "src/app/api/rfq/my-quotes/route.ts#items",
  "src/app/api/rfq/[id]/quotes/route.ts#items",
  // 订单历史：orchestrator.listAllOrders 返 NormalizedOrder[]，服务内逐键组装（createdAt/updatedAt/expiresAt）。
  "src/app/api/payment/orders/route.ts#list",
  // 自报品目落点：SupplierSelfReportNode = { code, nameZh }。
  "src/app/api/user/enterprise/route.ts#commodityNodes",
  // 企业名联想：Pick<SupplierDirectoryRow, "id"|"company"|"country"|"industry">，
  // 四个键本身都是单词（无 snake 形式）——但 `'' AS industry` 恒为空串，
  // 与资源库同类的产品数据链路缺口，本门禁管不了值只管得了键。
  "src/app/api/user/enterprise/suggest/route.ts#matches",
  // 匹配回读缓存：JSON.parse 的结果不过任何 mapper，但读取处有「无 supplierId 即视为未命中」
  // 的缓存闸（列名口径的旧缓存不原样吐上网），证据 tests/unit/lib/services/ai-match.test.ts。
  "src/app/api/notices/[id]/ai-match/route.ts#top",

  // 【乙 值是标量或 ID 数组】无键可漏，登记只为让「以后改成对象」当场报错。
  // 逐条举得出型：string[] / number[] / Promise<number> / Promise<string> / Promise<boolean>。
  "src/app/api/learning/purchased/route.ts#materialIds", // string[]
  "src/app/api/notices/favorites/ids/route.ts#ids", // number[]
  "src/app/api/notices/[id]/ai-match/route.ts#diagPending", // countDiagnosisPending(): Promise<number>
  "src/app/api/notices/[id]/report/preview/route.ts#totalReportChars", // estimateFullReportCharCount(): number
  "src/app/api/notifications/route.ts#unread", // unreadCount(): Promise<number>
  "src/app/api/rfq/[id]/quotes/route.ts#quoteId", // submitQuote(): Promise<{ quoteId: number }>
  "src/app/api/suppliers/stats/route.ts#registered", // countApproved(): Promise<number>
  "src/app/api/system/icp/route.ts#bah", // getIcpBah(): Promise<string>，形状由 tests/unit/app/api/system-view.test.ts 钉住
  "src/app/api/training/register/route.ts#id", // insertRegistration(): Promise<number>（自增 id）
  "src/app/api/user/enterprise/license-upload/route.ts#url", // UploadResult.url: string
  "src/app/api/user/enterprise/route.ts#claimCreated", // ensurePendingClaim(): Promise<boolean>
  "src/app/api/user/enterprise/route.ts#supplierId", // insertEnterprise(): Promise<number>

  // 【丙 已知 snake 上网·待收口】本面刚上线拓出来的真违规，登记不等于放过：
  // 每一行都写清「现在网上到底是哪些列名键」，收口完必须删行（不删就是陈旧项，当场红）。
  // 下面每条都附了 2026-10-29 只读探针（直调仓储层 + 只读事务）在真库上的实测键数。
  // 【已收口 2026-10-29】原登记项 user/enterprise#enterprise：出口改走 supplierEnterpriseViewOf
  // （lib/services/enterprise/view.ts，改名复用 shared/utils/case-keys）。实测台账：
  // PORTAL_COLUMNS 整行 31 键（不是旧注释算的 30），其中 15 个真带下划线需改名，剩下 16 个
  // 单列名 camel 与 snake 同形。前端契约类型不再是 Record<string, unknown>（类型抹平曾让
  // tsc/门禁/探针三路都看不见这批键）；表单字段 key 与 PUT body 仍是列名（请求侧允许），
  // 只在 EnterpriseEditForm 回填处用 toCamelKey 换一次键。
  // 键集合由 tests/integration/api-routes/user-enterprise.test.ts 钉（期望集从 PORTAL_COLUMNS 推）。
  // 【已收口 2026-10-29】原登记项 training/landing#course：出口改走
  // trainingCourseViewOf / trainingSchedulesViewOf（两条 SELECT * 整行都过视图），
  // 键集合由 tests/integration/api-routes/training-landing.test.ts 钉住。
  // 【已收口 2026-10-29】原登记项 training/orders/[orderNo]/participants#participants：
  // getParticipantsByOrderId() 是 `SELECT * FROM training_participants` 整行（11 列），
  // 现出口改走 trainingParticipantsViewOf，只发前端契约里的 7 个字段，
  // id/order_id/created_at/updated_at 行元数据不上网。隐私口径已核：该接口只能读
  // 自己订单的名单（路由校 user_id），姓名/电话/邮箱都是提交人自己的回显。
  // 附：本行旧版把 email 判成「幻影字段（表里没这一列）」——2026-10-29 只读探针推翻：
  // varchar(200) 列真在（baseline:2298），真相是 saveParticipants() 的 INSERT 漏写它
  // （用户填的邮箱一直静默丢弃）。本批两头补齐：写入口 + 视图下发，不拿删输入框掩盖。
  // 真库实测两表 0 行（无数据可达），所以键集合由
  // tests/integration/api-routes/training-participants.test.ts 从代码侧钉。
  // 【丙】组至此清零：四处已知 snake 上网已全部收口并删行（2026-10-29）。
]);

const WRAPPED_ALLOWLIST = new Set([
  ...DEFAULT_WRAPPED_ALLOWLIST,
  ...(process.env.API_FIELD_NAMING_WRAPPED_EXTRA || "")
    .split(",").map((s) => s.trim()).filter(Boolean),
]);

const repoRoot = scanRoot();
const apiDir = path.join(repoRoot, "src", "app", "api");

const problems = [];
let scanned = 0;
const allOffenders = new Set(); // 全部显式 snake 响应键（rel#key），不受白名单影响
const allOpaque = new Set(); // 全部「整块透出」出口（rel#变量/callee），不受登记集影响
const allWrapped = new Set(); // 全部「字面量包 opaque 值」浅层条目（rel#键），不受登记集影响
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; // 纯 snake_case（含至少一个下划线）
const EMIT_SEED = process.env.API_FIELDNAMING_EMIT_SEED === "1";
const EMIT_OPAQUE = process.env.API_FIELD_NAMING_EMIT_OPAQUE === "1";
const EMIT_WRAPPED = process.env.API_FIELD_NAMING_EMIT_WRAPPED === "1";
const JSON_CALL = /(?:NextResponse|Response)\.json\s*\(/;

/**
 * 从 X.json(...) 参数文本里抽对象键，两类都要抓：
 *   ① 显式 `foo_bar:`；② ES6 简写 `{ foo_bar, }` / `{ foo_bar }`——
 *   简写曾被漏过（report/preview 的 total_report_chars 就是这样溜过门禁的：
 *   键名即变量名，写的人根本不会意识到自己在往外吐 snake 键）。
 * 简写模式要求键后面紧跟 `,` 或 `}`，因此不会误抢 `k:`、数组元素、`obj.k` 或函数实参。
 * 分隔部分允许空白 / 整行 `//` 注释 / 块注释：实测两个键之间夹一行说明注释就会漏检
 * （notices/[id]/content 的 original_description 正是这样溜过去的）。不用“先把注释刷成
 * 空格”的全文预处理——那会把字符串里的 `://`（本域 URL 极多）当注释切断，反而制造新的漏检。
 */
function* objectKeys(args) {
  const sep = "(?:\\s|\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/)*";
  const labelRe = new RegExp("[{,]" + sep + "([a-zA-Z_][a-zA-Z0-9_]*)\\s*:", "g");
  const shortRe = new RegExp("[{,]" + sep + "([a-z][a-zA-Z0-9_]*)\\s*(?:,|\\})", "g");
  for (const m of args.matchAll(labelRe)) yield { key: m[1], index: m.index };
  for (const m of args.matchAll(shortRe)) yield { key: m[1], index: m.index };
}

/** 取第一个实参文本（深度 0 处遇逗号截断），用于判定响应体是不是字面量 */
function firstArgOf(args) {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) return args.slice(0, i);
  }
  return args;
}

/** 从 openIdx 处的 { 或 [ 开始，取到配平结束（跳过字符串） */
function balanced(text, openIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return text.slice(openIdx);
}

// mapper 痕迹：函数名叫 *ViewOf / *viewsOf / toCamel* / *ViewModel* 等。
// 这是名字约定，不是保证；目的是让「新写的 json(变量)」当场报错，而不是静默过关。
const MAPPER_HINT = /[Vv]iewOf|viewsOf|toCamel|to[A-Z]\w*View|ForView|(?:^|[^A-Za-z0-9])[Aa]sView\(/;

/** 找调用点之前该变量的最后一次本地声明，返回初始化表达式（含偏移，用于算行号） */
function declInit(src, name, beforeIdx) {
  // 允许类型标注 `const x: T = …`：实测 leads 的 newLead、membership/credits 的 body 都带标注，
  // 只按 `const x =` 找就找不到声明，把「键名完全看得见」的出口误记成了「看不见」的债。
  const declRe = new RegExp(`(?:const|let|var)\\s+${name.replace(/\$/g, "\\$")}\\b\\s*(?::[^\\n]*?)?=\\s*`, "g");
  let last = null;
  let m;
  while ((m = declRe.exec(src))) if (m.index < beforeIdx) last = m;
  if (!last) return null;
  const start = last.index + last[0].length;
  // 初始化式只能限在本语句内：不截止就会把后面的 `if (…) { … }` 当成本变量的键区，
  // 把「整块透出」（必须登记）误判成「字面量已查」（静默过关）。
  return { offset: start, text: statementAt(src, start) };
}

/** 从 from 起取到语句结尾：深度 0 处的第一个 `;`（本仓库由 Prettier 统一保证分号） */
function statementAt(text, from) {
  let depth = 0;
  let inStr = null;
  const limit = Math.min(text.length, from + 4000);
  for (let i = from; i < limit; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth <= 0) return text.slice(from, i);
  }
  return text.slice(from, limit);
}

/**
 * 去掉括号内的内容（函数实参区）：那里的 { } 是「请求参数」而不是响应键，
 * 按 ② 的口径不该由本门禁负责（请求参数允许 snake_case）。
 * 字符串整体丢弃：既不会把 URL/文案里的花括号当成键区，也不会因此误报。
 * 被丢弃的位置用空格占位（换行原样保留），保证下标与原文 1:1 对齐，报错行号才能算准。
 */
function stripCallArgs(text) {
  let out = "";
  let depth = 0;
  let inStr = null;
  const blank = (c) => (c === "\n" || c === "\r" ? c : " ");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += blank(c);
      if (c === "\\") {
        i++;
        if (i < text.length) out += blank(text[i]);
      } else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      out += blank(c);
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth) depth--;
    }
    out += depth ? blank(c) : c;
  }
  return out;
}

/**
 * 展开写法（`{ ...x }` / `{ ...svc(row) }`）会把静态面看不见的键带进响应体。
 * 含展开的「字面量」不算键已查清，除非展开源本身就是视图 mapper（名字带 *ViewOf / toCamel*，
 * 输出契约已由类型层钉住）。返回「盲区展开源」供登记用；空数组 = 键区看得清。
 * 登记键取第一个盲区源的名字，保证稳定可读（实测全站仅十余处）。
 */
function blindSpreadSources(text) {
  if (!/\.\.\./.test(text)) return [];
  const blind = [];
  for (const m of text.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:\(|[,;})\]])/g)) {
    if (!MAPPER_HINT.test(m[1])) blind.push(m[1]);
  }
  return blind;
}

/**
 * 内建标量生产者：这些调用的返回值不可能携带键，所以浅层条目无需登记。
 * 排除项只列「举证得清的」内建/工具函数，不靠变量名长相猜安全（上一版的名称启发式
 * 既漏报又误报：runtime/probe-wrapped-opaque.mjs v1 因只认 await 开头、只认带标签条目，
 * 把五个认证出口中的两个漏成了「三处」）。
 * `…searchParams.get()` 也算在内：URLSearchParams.get 的返回型就是 string | null。
 */
const SCALAR_VALUE_CALL =
  /^(?:Math\.[A-Za-z]|Number\(|String\(|Boolean\(|parseInt\(|parseFloat\(|JSON\.stringify\(|encodeURIComponent\(|decodeURIComponent\(|clampLimit\(|Array\.isArray\(|Object\.(?:keys|values|entries)\(|new Date\(|Date\.now\(|globalThis\.|signAccessToken\(|signRefreshToken\(|maskPhone\(|maskName\(|(?:[A-Za-z_$][\w$]*\.)*searchParams\.get\()/;

/**
 * 变量声明式查找的「宽松版」：除了 `const x = …`，还认
 * `const { x, y } = await f(…)` / `const [x, y] = await Promise.all([…])`。
 * 为什么必须认解构：登录/注册两个出口写的就是 `const { payload, … } = await loginWithPassword(…)`，
 * 只认直接声明就会重复上一版探针的漏报。
 * @returns {{offset:number, text:string}|null} offset 为 `=` 右侧起点，text 为语句级初始化式
 */
function declInitLoose(src, name, beforeIdx) {
  const esc = name.replace(/\$/g, "\\$");
  const re = new RegExp(
    `(?:const|let|var)\\s+(?:${esc}\\b|\\{[^{}]*\\b${esc}\\b[^{}]*\\}|\\[[^\\[\\]]*\\b${esc}\\b[^\\[\\]]*\\])\\s*(?::[^\\n=]*)?=\\s*`,
    "g",
  );
  let last = null;
  let m;
  while ((m = re.exec(src))) if (m.index < beforeIdx) last = m;
  if (!last) return null;
  const offset = last.index + last[0].length;
  return { offset, text: statementAt(src, offset) };
}

/** 判定一个初始化式是不是「只能靠名字看、静态面读不出键」的调用出口 */
function isOpaqueValueInit(text) {
  const head = text.trimStart().replace(/^await\s+/, "");
  if (!head) return false;
  const lead = head[0];
  if (lead === "{" || lead === "[") return false; // 字面量：键区已由规则一查过
  if (MAPPER_HINT.test(head)) return false; // 已过视图 mapper
  if (SCALAR_VALUE_CALL.test(head)) return false; // 不可能带键
  return /^[A-Za-z_$][\w$.]*\s*\(/.test(head); // 只有一次调用的出口才算 opaque
}

/**
 * 内联映射回调（`rows.map((row) => ({ … }))`）的元素形状就写在文本里，不该算 opaque。
 * 只取 `.map( … )` 括号内的回调体（再用 stripCallArgs 把回调里的函数实参刷掉，
 * 那里面的花括号是请求参数不是响应键），返回其浅层键；无 `.map(` 或回调体无字面量时返回 null。
 * 为什么要单独认这一形：不认就会把 rfq/list 这种「键全写得出来」的出口误报成债，
 * 而认了还能顺手查出内联映射里写的 snake 键（规则一原本只查 json(...) 括号内，看不到这里）。
 */
function mapCallbackKeys(initText) {
  const at = initText.search(/\.map\s*\(/);
  if (at < 0) return null;
  const open = initText.indexOf("(", at);
  const close = matchParen(initText, open);
  if (close < 0) return null;
  // 下面逐次剪掉回调外壳（参数表 / 包裹括号），同时记录起点偏移，报错行号才能算准
  let start = open + 1;
  let text = initText.slice(start, close);
  const lead = text.trimStart();
  start += text.length - lead.length;
  text = lead;
  const param = /^\((?:[^()]*)\)\s*=>\s*|^[A-Za-z_$][\w$]*\s*=>\s*|^function\s*\((?:[^()]*)\)\s*/.exec(text);
  if (param) {
    start += param[0].length;
    text = text.slice(param[0].length);
  }
  // 表达式体常写成 `=> ({ … })`：先剥掉包裹的括号，否则 stripCallArgs 会把键区一起刷白
  if (text.startsWith("(")) {
    const inner = matchParen(text, 0);
    if (inner > 0) {
      start += 1;
      text = text.slice(1, inner);
    }
  }
  const visible = stripCallArgs(text);
  if (!visible.includes("{")) return null;
  return { offset: start, keys: [...objectKeys(visible)] };
}

/** 吃掉片段开头的空白与注释（与 objectKeys 同一理由：键区中间可能夹说明注释） */
function stripLeadingTrivia(piece) {
  const re = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/;
  const n = re.exec(piece)[0].length;
  return { text: piece.slice(n), offset: n };
}

/**
 * 取对象字面量（含外层花括号）的浅层条目，只返回「值是裸标识符（可带 `|| 兜底`）」或简写的那些：
 * 这是第三面的入口——外层键看得见、值内部的键看不见。
 * 不取嵌套层（里面的键规则一已查过），也不取展开/计算键/三元/函数值。
 * @returns {Array<{key:string, value:string, index:number}>} index 相对 lit 起点，用于算行号
 */
function shallowValueEntries(lit) {
  const out = [];
  const pieces = [];
  let depth = 0;
  let inStr = null;
  // start = 1：跳过外层 `{` 本身（写成 0 会把花括号当成第一个片段的一部分，
  // 于是 `{ materials }` 的片段变成 "{ materials"，标识符判定全部失效、本面静默归零）。
  let start = 1;
  for (let i = 1; i < lit.length; i++) {
    const c = lit[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) { pieces.push([start, i]); start = i + 1; break; } // 字面量收尾
      depth--;
    } else if (c === "," && depth === 0) { pieces.push([start, i]); start = i + 1; }
  }
  for (const [from, to] of pieces) {
    const raw = lit.slice(from, to);
    const { text, offset } = stripLeadingTrivia(raw);
    const at = from + offset;
    if (!text || text.startsWith("...")) continue;
    // 找深度 0 的第一个 `:` 分标签/值
    let d = 0;
    let colon = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "(" || c === "{" || c === "[") d++;
      else if (c === ")" || c === "}" || c === "]") d--;
      else if (c === ":" && d === 0) { colon = i; break; }
    }
    if (colon < 0) {
      const name = text.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push({ key: name, value: name, index: at });
      continue;
    }
    const key = text.slice(0, colon).trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue; // 计算键 `[x]:` 等不在口径内
    const valueText = text.slice(colon + 1).trim();
    const m = /^([A-Za-z_$][\w$]*)(?:\s*\|\|[\s\S]*)?$/.exec(valueText);
    if (!m) continue; // 函数值 / 三元 / 表达式：不属于本面
    out.push({ key, value: m[1], index: at });
  }
  return out;
}

/**
 * 判定一个 json(…) 实参的形态。
 * @returns {{kind:"literal"|"indirect"|"mapped"|"opaque", arg:string, text:string, offset?:number}}
 *   literal → 直接内联字面量，键名已由规则一逐个看过；
 *   indirect → 响应体是本地变量且能解析到字面量（含三元分支里的字面量），键名可查；
 *   mapped → 已过视图 mapper；opaque → 整块透出，需登记。
 *   （宁可多要求一条登记，不要把猜名字当成安全。）
 */
function classifyArg(src, args, callIdx) {
  const raw = firstArgOf(args).trim();
  if (!raw) return { kind: "mapped", arg: "", text: "" };
  if (raw.startsWith("{") || raw.startsWith("[")) {
    // 同一口径：字面量里写了 `...x` 就等于有一部分键静态面看不见（实测全站仅十余处），
    // 所以一并要求登记，不区分“展开写在哪一侧”；展开源是视图 mapper 的除外。
    const blind = blindSpreadSources(raw);
    if (blind.length) return { kind: "opaque", arg: blind[0], text: raw };
    return { kind: "literal", arg: raw[0], text: raw };
  }
  if (MAPPER_HINT.test(raw)) return { kind: "mapped", arg: raw, text: raw };
  const ident = /^([A-Za-z_$][\w$]*)$/.exec(raw);
  if (ident) {
    const decl = declInit(src, ident[1], callIdx);
    if (decl) {
      const head = decl.text.trimStart();
      const offBase = decl.offset + (decl.text.length - head.length);
      const lead = head[0];
      if (lead === "{" || lead === "[") {
        const text = balanced(decl.text, decl.text.indexOf(lead));
        const blind = blindSpreadSources(text);
        if (!blind.length) {
          return { kind: "indirect", arg: ident[1], text, offset: offBase };
        }
        return { kind: "opaque", arg: ident[1], text: raw };
      }
      // 三元/短路等复合式：分支里可能直接写了响应字面量（membership/credits 就是）。
      // 先把函数实参区剔掉，剩下的花括号才真的是本变量的键区。
      const visible = stripCallArgs(head);
      if (visible.includes("{") && !blindSpreadSources(visible).length) {
        return { kind: "indirect", arg: ident[1], text: visible, offset: offBase };
      }
      if (MAPPER_HINT.test(head)) return { kind: "mapped", arg: ident[1], text: raw };
    }
    return { kind: "opaque", arg: ident[1], text: raw };
  }
  // 三元/模板等复杂表达式：只要内含对象字面量，它的键已由规则一逐个看过，
  // 不必再当「整块透出」（否则登记键会变成一截提行文本，既不稳也不好读）。
  if (raw.includes("{")) return { kind: "literal", arg: "", text: "" };
  // 调用式 / 成员访问：取 callee 名做登记键（稳且可读）
  const call = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/.exec(raw);
  if (call) return { kind: "opaque", arg: call[1], text: raw };
  const member = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)$/.exec(raw);
  return { kind: "opaque", arg: member ? member[1] : raw.slice(0, 40), text: raw };
}

for (const file of collectRouteFiles(apiDir)) {
  scanned++;
  const rel = relOf(repoRoot, file);
  const src = readText(file);

  // 定位每个 X.json(...) 调用：规则一查参数区里的显式字面量键，规则二查「整块透出」
  for (const { open, args, matchIndex } of callSites(src, JSON_CALL)) {
    for (const { key, index } of objectKeys(args)) {
      if (METADATA_KEYS.has(key)) continue;
      if (!SNAKE_RE.test(key)) continue;
      const id = `${rel}#${key}`;
      allOffenders.add(id);
      if (ALLOWLIST.has(id)) continue;
      problems.push(`[SNAKE-KEY] ${rel}:${lineOf(src, open + 1 + index)}: 响应体键 "${key}" 为 snake_case（实体字段应 camelCase；存量请登记递减白名单）`);
    }

    const cls = classifyArg(src, args, matchIndex);
    if (cls.kind === "indirect") {
      // 响应体是 `const body = { … }` / `const body: T = ok ? { … } : null` 这种间接字面量：
      // 键名同样得过检查（原先只查 json(...) 括号内的字面量，这种形态完全看不见）。
      for (const { key, index } of objectKeys(cls.text)) {
        if (METADATA_KEYS.has(key) || !SNAKE_RE.test(key)) continue;
        const id = `${rel}#${key}`;
        allOffenders.add(id);
        if (ALLOWLIST.has(id)) continue;
        problems.push(`[SNAKE-KEY] ${rel}:${lineOf(src, cls.offset + index)}: 响应体变量 ${cls.arg} 里的键 "${key}" 为 snake_case`);
      }
    }
    if (cls.kind === "opaque") {
      const id = `${rel}#${cls.arg}`;
      allOpaque.add(id);
      if (EMIT_OPAQUE) continue;
      if (!OPAQUE_ALLOWLIST.has(id)) {
        problems.push(`[OPAQUE-PAYLOAD] ${rel}:${lineOf(src, open)}: 响应体整块透出 ${cls.arg}（静态面看不见它的键）——请过本域视图 mapper（*ViewOf / toCamel*），或确实无需转换时登记递减清单`);
      }
    }

    // 规则三：「字面量包 opaque 值」。信封是字面量（所以上面的键不会被误当成整块透出），
    // 但某个浅层条目的值是一个本地标识符，而且该标识符的初始化式又是一次调用——
    // 那个值内部的键在静态面完全不可见（供应商资源库与认证响应体两个真违规都是这个形状）。
    const litRaw = cls.kind === "literal" || cls.kind === "indirect" ? firstArgOf(args) : null;
    const litText = litRaw !== null && litRaw !== undefined ? litRaw.trimStart() : "";
    let litBase = 0;
    if (cls.kind === "indirect" && cls.text.startsWith("{")) {
      litBase = cls.offset;
    } else if (litText.startsWith("{")) {
      litBase = open + 1 + (litRaw.length - litText.length);
    } else {
      litBase = -1;
    }
    if (litBase >= 0) {
      const source = cls.kind === "indirect" ? cls.text : litText;
      for (const e of shallowValueEntries(source)) {
        if (METADATA_KEYS.has(e.key)) continue; // 分页/元数据位按口径本来就该是标量
        const decl = declInitLoose(src, e.value, matchIndex);
        if (!decl) continue;
        const inline = mapCallbackKeys(decl.text);
        if (inline) {
          // 元素键就写在路由文件里：不要求登记，但逐个按规则一查一遍
          for (const { key, index } of inline.keys) {
            if (METADATA_KEYS.has(key) || !SNAKE_RE.test(key)) continue;
            const kid = `${rel}#${key}`;
            allOffenders.add(kid);
            if (ALLOWLIST.has(kid)) continue;
            problems.push(`[SNAKE-KEY] ${rel}:${lineOf(src, decl.offset + inline.offset + index)}: 响应体键 "${e.key}" 的内联映射里写了 snake_case 键 "${key}"`);
          }
          continue;
        }
        if (!isOpaqueValueInit(decl.text)) continue;
        const id = `${rel}#${e.key}`;
        allWrapped.add(id);
        if (EMIT_WRAPPED) continue;
        if (!WRAPPED_ALLOWLIST.has(id)) {
          problems.push(`[WRAPPED-VALUE] ${rel}:${lineOf(src, litBase + e.index)}: 响应体键 "${e.key}" 的值 ${e.value} 是一次调用的返回值（静态面看不见它内部的键）——请过本域视图 mapper（*ViewOf / toCamel*），或确实无需转换时登记递减清单`);
        }
      }
    }
  }
}

if (EMIT_SEED) {
  const arr = [...allOffenders].sort();
  console.log(`// 共 ${arr.length} 项，粘贴进 ALLOWLIST：`);
  for (const k of arr) console.log(`  "${k}",`);
  process.exit(0);
}

if (EMIT_OPAQUE) {
  const arr = [...allOpaque].sort();
  console.log(`// 整块透出出口共 ${arr.length} 项，粘贴进 OPAQUE_ALLOWLIST：`);
  for (const k of arr) console.log(`  "${k}",`);
  process.exit(0);
}

if (EMIT_WRAPPED) {
  const arr = [...allWrapped].sort();
  console.log(`// 「字面量包 opaque 值」浅层条目共 ${arr.length} 项，逐个人工核实后粘贴进 WRAPPED_ALLOWLIST：`);
  for (const k of arr) console.log(`  "${k}",`);
  process.exit(0);
}

reportAndExit({
  tag: "API-FIELD-NAMING",
  title: "响应字段命名",
  problems,
  shown: 60,
  stale: [
    ...staleAllowlistEntries(ALLOWLIST, allOffenders, repoRoot),
    ...staleAllowlistEntries(OPAQUE_ALLOWLIST, allOpaque, repoRoot),
    ...staleAllowlistEntries(WRAPPED_ALLOWLIST, allWrapped, repoRoot),
  ],
  guidance: "准则：API 响应实体字段用 camelCase（请求参数/分页元数据用 snake_case）；整块透出与「包在服务返回值里的键」都必须过视图 mapper。",
  okLine: `✓ API 响应字段命名红线通过（扫描 ${scanned} 个 route.ts：显式 snake 键 ${DEFAULT_ALLOWLIST.size} 项、整块透出登记 ${DEFAULT_OPAQUE_ALLOWLIST.size} 处、浅层 opaque 值登记 ${DEFAULT_WRAPPED_ALLOWLIST.size} 处，均为递减存量）`,
});
