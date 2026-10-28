import path from "node:path";
import {
  scanRoot,
  relOf,
  readText,
  collectRouteFiles,
  callSites,
  lineOf,
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
 *     必须过视图 mapper 或登记递减清单（登记集见 OPAQUE_ALLOWLIST，含「已实测/待核验」分组）。
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
  // 【B 字段命名 sweep 实测无 snake 键·但仍未收 mapper】键是本域约定名或 SQL 聚合别名；
  // 迁视图时请顺手删行，让登记集只反映「真的看不见」的出口。
  "src/app/api/catalog/country-name-map/route.ts#maps",
  "src/app/api/certifications/route.ts#rows",
  // leads 两条已于 2026-10-28 移出登记集：路由本来就在过隐私收窄 DTO，只是函数名叫
  // mapLeadForMemberView——规则二只认 *ViewOf / to*View 这类约定名。改名 leadMemberViewOf
  // 后静态面自己能认出已收视图，无需再占登记位（键集合由 tests/unit/lib/services/leads.test.ts 钉住）。
  // countries / hot-topics 两条已于同日升到 A（有假 pool 单测钉键集合，见上面 A 段说明）。
  "src/app/api/payment/orders/route.ts#result",
  // system 族两条已于 2026-10-28 处理（键集合由 tests/unit/app/api/system-view.test.ts 钉住）：
  //   links 首次出口改收 footerLinkViewOf → 静态面能认出，登记删除；
  //   icp 改为显式字面量出口（不再把内部缓存时间戳 ts 送上网）→ 登记删除；
  //   linksCache.items（TTL 命中分支）已升到 A：它是模块级可变缓存，内容与
  //   footerLinkViewOf 产出的是同一个数组，属「已收口但静态看不见」。
  "src/app/api/user/keyword-groups/route.ts#data",
  // 2026-10-28 只读探针实测无 snake 键（runtime/probe-opaque-c-group.ts，走与路由同一条生产链）：
  // 以下 5 个原本「未实测」，现已拿到真实响应键集合，但仍未收进 *ViewOf 视图，故留在 B：
  //   suppliers/stats（6 键全 camel）、industries/tree（key/nameZh/nameEn）、
  //   learning/materials/[id]/content（contentZh/contentEn/fileUrl/fileName）、
  //   suppliers/[id]（已过 supplierViewOf，26 键全 camel）、
  //   notices/unified-search（143 键全 camel；items 已过 toNoticeListView；
  //     本次 Meili 不健康走 SQL 回退路径，但两路出同一 mapper）
  // suppliers 两条已于 2026-10-28 移出登记集：探针早已实测无 snake，但 mapSupplierRow /
  // mapSupplierItems 不合约定名，静态面认不出已收口 → 改名 supplierViewOf / toSupplierListView。
  // industries/tree 已于同日升到 A（树族共用同一行→选项映射，见 A 段说明）。
  // notices/unified-search 已于 2026-10-28 整条删除登记位：路由不再 `json({ ...result, … })`，
  // 改成显式列举信封（键集合由 tests/unit/app/api/notices/unified-search-gate.test.ts 钉住），
  // 盲区已不成立→登记必须跟着删（登记集只反映「真的看不见」的出口）；
  // 同时撤掉 spread 漏出来的同值 pageSize，分页元数据只发 page_size。
  "src/app/api/learning/materials/[materialId]/content/route.ts#payload",
  "src/app/api/suppliers/stats/route.ts#stats",
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

const repoRoot = scanRoot();
const apiDir = path.join(repoRoot, "src", "app", "api");

const problems = [];
let scanned = 0;
const allOffenders = new Set(); // 全部显式 snake 响应键（rel#key），不受白名单影响
const allOpaque = new Set(); // 全部「整块透出」出口（rel#变量/callee），不受登记集影响
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; // 纯 snake_case（含至少一个下划线）
const EMIT_SEED = process.env.API_FIELDNAMING_EMIT_SEED === "1";
const EMIT_OPAQUE = process.env.API_FIELD_NAMING_EMIT_OPAQUE === "1";
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

reportAndExit({
  tag: "API-FIELD-NAMING",
  title: "响应字段命名",
  problems,
  shown: 60,
  stale: [
    ...staleAllowlistEntries(ALLOWLIST, allOffenders, repoRoot),
    ...staleAllowlistEntries(OPAQUE_ALLOWLIST, allOpaque, repoRoot),
  ],
  guidance: "准则：API 响应实体字段用 camelCase（请求参数/分页元数据用 snake_case）；整块透出必须过视图 mapper。",
  okLine: `✓ API 响应字段命名红线通过（扫描 ${scanned} 个 route.ts：显式 snake 键 ${DEFAULT_ALLOWLIST.size} 项、整块透出登记 ${DEFAULT_OPAQUE_ALLOWLIST.size} 处，均为递减存量）`,
});
