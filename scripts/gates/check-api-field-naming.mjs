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
  "src/app/api/auth/forgot-password/route.ts#email_sent",
  "src/app/api/auth/forgot-password/route.ts#sms_sent",
  "src/app/api/auth/forgot-password/route.ts#support_hint",
  "src/app/api/auth/send-email-code/route.ts#email_sent",
  "src/app/api/auth/send-phone-code/route.ts#sms_sent",
  "src/app/api/auth/send-register-sms-code/route.ts#sms_sent",
  "src/app/api/crm/chat/messages/route.ts#created_at",
  "src/app/api/crm/chat/messages/route.ts#session_id",
  "src/app/api/learning/purchased/route.ts#material_ids",
  "src/app/api/notices/[id]/content/route.ts#description_cn",
  "src/app/api/notices/[id]/detail/route.ts#ai_analysis",
  "src/app/api/notices/[id]/detail/route.ts#ai_products",
  "src/app/api/notices/[id]/detail/route.ts#bid_overview",
  "src/app/api/notices/[id]/detail/route.ts#core_locked",
  "src/app/api/notices/[id]/detail/route.ts#deadline_timezone",
  "src/app/api/notices/[id]/detail/route.ts#description_other",
  "src/app/api/notices/[id]/detail/route.ts#report_available",
  "src/app/api/notices/[id]/detail/route.ts#report_url",
  "src/app/api/notices/[id]/detail/route.ts#supplier_conditions",
  "src/app/api/notices/[id]/detail/route.ts#technical_hurdles",
  "src/app/api/notices/[id]/detail/route.ts#unlock_type",
  "src/app/api/notices/[id]/detail/route.ts#unlocked_at",
  "src/app/api/notices/[id]/interest/route.ts#interest_type",
  "src/app/api/notices/[id]/preview/route.ts#buyer_name",
  "src/app/api/notices/[id]/preview/route.ts#country_code",
  "src/app/api/notices/[id]/preview/route.ts#deadline_ts",
  "src/app/api/notices/[id]/preview/route.ts#estimated_value",
  "src/app/api/notices/[id]/preview/route.ts#notice_pk",
  "src/app/api/notices/[id]/preview/route.ts#notice_type_code",
  "src/app/api/notices/[id]/report/preview/route.ts#has_full_report",
  "src/app/api/notices/[id]/report/preview/route.ts#is_unlocked",
  "src/app/api/notices/[id]/unlock/route.ts#unlock_type",
  "src/app/api/notices/unified-search/route.ts#advanced_degraded",
  "src/app/api/notices/unified-search/route.ts#needs_industry_selection",
  "src/app/api/opportunities/[id]/unlock/route.ts#unlock_type",
  "src/app/api/opportunities/route.ts#source_url",
  "src/app/api/payment/orders/route.ts#pay_url",
  "src/app/api/payment/orders/route.ts#payment_mode",
  "src/app/api/payment/orders/route.ts#qr_code_url",
  "src/app/api/payments/[orderNo]/mock-paid/route.ts#order_no",
  "src/app/api/payments/config-status/route.ts#active_provider_configs",
  "src/app/api/payments/config-status/route.ts#app_id",
  "src/app/api/payments/config-status/route.ts#is_active",
  "src/app/api/payments/config-status/route.ts#merchant_id",
  "src/app/api/payments/config-status/route.ts#notify_url",
  "src/app/api/payments/config-status/route.ts#required_env",
  "src/app/api/supplier-claims/route.ts#created_at",
  "src/app/api/supplier-claims/route.ts#expires_at",
  "src/app/api/supplier-diagnosis/mine/route.ts#company_name",
  "src/app/api/supplier-diagnosis/mine/route.ts#schema_version",
  "src/app/api/supplier-diagnosis/mine/route.ts#score_grade",
  "src/app/api/supplier-diagnosis/mine/route.ts#score_total",
  "src/app/api/supplier-diagnosis/mine/route.ts#submitted_at",
  "src/app/api/supplier-diagnosis/mine/route.ts#supplier_id",
  "src/app/api/supplier-diagnosis/route.ts#claim_required",
  "src/app/api/supplier-diagnosis/route.ts#grade_label",
  "src/app/api/supplier-diagnosis/route.ts#override_gate",
  "src/app/api/supplier-diagnosis/route.ts#score_grade",
  "src/app/api/supplier-diagnosis/route.ts#score_total",
  "src/app/api/supplier-diagnosis/route.ts#supplier_id",
  "src/app/api/supplier-diagnosis/route.ts#top_gaps",
  "src/app/api/training/orders/[orderNo]/mock-paid/route.ts#order_no",
  "src/app/api/training/orders/[orderNo]/participants/route.ts#order_no",
  "src/app/api/training/orders/[orderNo]/participants/route.ts#participant_count",
]);

const repoRoot = scanRoot();
const apiDir = path.join(repoRoot, "src", "app", "api");

const problems = [];
let scanned = 0;
const allOffenders = new Set(); // 全部显式 snake 响应键（rel#key），不受白名单影响
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; // 纯 snake_case（含至少一个下划线）
const EMIT_SEED = process.env.API_FIELDNAMING_EMIT_SEED === "1";
const JSON_CALL = /(?:NextResponse|Response)\.json\s*\(/;

for (const file of collectRouteFiles(apiDir)) {
  scanned++;
  const rel = relOf(repoRoot, file);
  const src = readText(file);

  // 定位每个 X.json(...) 调用的参数区，抽其对象字面量显式键
  for (const { open, args } of callSites(src, JSON_CALL)) {
    for (const km of args.matchAll(/[{,]\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) {
      const key = km[1];
      if (METADATA_KEYS.has(key)) continue;
      if (!SNAKE_RE.test(key)) continue;
      const id = `${rel}#${key}`;
      allOffenders.add(id);
      if (ALLOWLIST.has(id)) continue;
      problems.push(`[SNAKE-KEY] ${rel}:${lineOf(src, open + 1 + km.index)}: 响应体键 "${key}" 为 snake_case（实体字段应 camelCase；存量请登记递减白名单）`);
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
