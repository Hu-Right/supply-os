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
 * 精确口径：只静态检查 route.ts 里 `NextResponse.json({...}) / Response.json({...})`
 *   的**显式对象字面量键**（分页/元数据白名单键豁免）。`...row` 展开与 mapper 产出的键
 *   不在此静态面内（由分域迁移 + 端到端验证覆盖），故本门禁是「冻结显式债务、禁止新增」。
 *
 * 扫描/报告/白名单卫生均走共享骨架 `lib/api-contract.mjs`（四条 API 契约门禁同一口径）。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_CONTRACT_SCAN_ROOT=<path>  把扫描根换到 <path>（自测 fixture 用；默认仓库根）
 *   API_FIELDNAMING_EMIT_SEED=1    导出当前全部显式 snake 键（造初白名单用）
 */

// 合法保留 snake_case 的响应元数据/分页键（规范允许 snake，非实体字段）。
const METADATA_KEYS = new Set([
  "page", "page_size", "per_page", "current_page", "total", "total_pages", "page_count",
  "limit", "offset", "count", "has_more", "has_next", "next_cursor", "prev_cursor",
  "order_by", "sort_by", "data_start", "data_end",
]);

// 递减白名单（`<相对 route.ts>#<snake 键>`）：存量显式 snake 响应键，迁移一个删一行；新增不得进入。
const ALLOWLIST = new Set([
  // notices 全域（detail 12 项 + preview 6 项）与 content（2 项）已于 2026-10-27 迁完：
  // 行→视图统一走 lib/services/notice-public/view.ts（机械改名，值原样透传），
  // 响应契约由 types/procurement.ts 的 camelCase 字段定义，不再镜像列名。
  // preview 故意不调 mapper：它是付费墙，只发已登记的 8 个键（mapper 是改名不裁剪）。
  "src/app/api/opportunities/route.ts#source_url",
  // ⚠ 下面 3 项不单独改：本端点响应由四个业务服务（membership/learning/training/service）
  // 的同一形状透出，只改建单会让同一条支付流程“建单 camel、轮询 snake”，
  // 必须整族（OrderInfo/OrderStatusResult/四服务/三端点/前端）一次迁完。
  "src/app/api/payment/orders/route.ts#pay_url",
  "src/app/api/payment/orders/route.ts#payment_mode",
  "src/app/api/payment/orders/route.ts#qr_code_url",
]);

const repoRoot = scanRoot();
const apiDir = path.join(repoRoot, "src", "app", "api");

const problems = [];
let scanned = 0;
const allOffenders = new Set(); // 全部显式 snake 响应键（rel#key），不受白名单影响
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; // 纯 snake_case（含至少一个下划线）
const EMIT_SEED = process.env.API_FIELDNAMING_EMIT_SEED === "1";
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

for (const file of collectRouteFiles(apiDir)) {
  scanned++;
  const rel = relOf(repoRoot, file);
  const src = readText(file);

  // 定位每个 X.json(...) 调用的参数区，抽其对象字面量显式键
  for (const { open, args } of callSites(src, JSON_CALL)) {
    for (const { key, index } of objectKeys(args)) {
      if (METADATA_KEYS.has(key)) continue;
      if (!SNAKE_RE.test(key)) continue;
      const id = `${rel}#${key}`;
      allOffenders.add(id);
      if (ALLOWLIST.has(id)) continue;
      problems.push(`[SNAKE-KEY] ${rel}:${lineOf(src, open + 1 + index)}: 响应体键 "${key}" 为 snake_case（实体字段应 camelCase；存量请登记递减白名单）`);
    }
  }
}

if (EMIT_SEED) {
  const arr = [...allOffenders].sort();
  console.log(`// 共 ${arr.length} 项，粘贴进 ALLOWLIST：`);
  for (const k of arr) console.log(`  "${k}",`);
  process.exit(0);
}

reportAndExit({
  tag: "API-FIELD-NAMING",
  title: "响应字段命名",
  problems,
  shown: 60,
  stale: staleAllowlistEntries(ALLOWLIST, allOffenders, repoRoot),
  guidance: "准则：API 响应实体字段用 camelCase（请求参数/分页元数据用 snake_case）。",
  okLine: `✓ API 响应字段命名红线通过（扫描 ${scanned} 个 route.ts，显式 snake 键 ${ALLOWLIST.size} 项冻结递减）`,
});
