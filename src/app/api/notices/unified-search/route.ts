/**
 * GET /api/notices/unified-search — 统一搜索（default/prefs/recommended 模式）
 *
 * @module app/api/notices/unified-search/route
 */
import { NextRequest, NextResponse } from "next/server";
import { extractUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { searchUnified } from "@/lib/services/search-orchestrator";
import type { RawSearchParams } from "@/lib/services/search-orchestrator/params";
import { getPool } from "@/lib/db/pool";
import { withRoute } from "@/lib/middleware/route-handler";
import { getContext } from "@/lib/db/context";
import { resolveAdvancedQuery, hasAdvancedSyntax } from "@/shared/utils/advanced-syntax";

function parseSearchParams(req: NextRequest): RawSearchParams {
  const sp = req.nextUrl.searchParams;
  const get = (k: string, d = "") => sp.get(k) || d;
  const getInt = (k: string, d = 0) => { const v = sp.get(k); return v ? Number(v) : d; };
  // 属性名使用 camelCase，与 RawSearchParams 接口及 validateParams 内部字段对齐
  return {
    mode: get("mode", "default"),
    userId: 0,
    page: getInt("page", 1),
    pageSize: getInt("page_size", 10),
    locale: get("locale"),
    q: get("q"),
    country: get("country"),
    agency: get("agency"),
    deadlineFrom: get("deadline_from"),
    deadlineTo: get("deadline_to"),
    deadlineWithinDays: getInt("deadline_within_days"),
    noticeType: get("notice_type"),
    featuredOnly: sp.get("featured") === "1",
    sort: get("sort", "latest"),
    codeId: getInt("code_id") || getInt("industry_id"),
    budgetMin: sp.get("budget_min") ? Number(sp.get("budget_min")) : undefined,
    budgetMax: sp.get("budget_max") ? Number(sp.get("budget_max")) : undefined,
    matchMode: get("match_mode"),
  };
}

export const GET = withRoute(async (req: NextRequest) => {
  // 公开端点限流：防止脚本无成本打满连接池（降级路径一次 COUNT + FULLTEXT UNION）
  const rateLimitResponse = checkRateLimit(req, {
    windowMs: 60_000,
    maxAttempts: 60,
  }, () => `search:${extractClientIp(req)}`);
  if (rateLimitResponse) return rateLimitResponse;

  const auth = await extractUserKey(req);
  const params = parseSearchParams(req);
  // 身份参数仅传 userId（crm_users.user_key 列退役收尾）
  params.userId = auth.userId || undefined;
  // 高级语法档位门控（spec §3.3）：含 -排除/"短语" 时按 advanced_keyword_search 判档，
  // 无权益剥离降级（普通多词 AND 是既有行为，不受影响）；匿名恒按 free 口径
  const ctx = getContext();
  // 前置 hasAdvancedSyntax：q 无高级语法时跳过权益查询（3 条串行查询在最热公共端点上不能白跑）；
  // 无语法 → entitled=false → resolveAdvancedQuery 原样透传，语义不变
  const entitled = auth.userId && hasAdvancedSyntax(params.q ?? "")
    ? await ctx.benefitSystemRepo.isEntitled(auth.userId, "advanced_keyword_search")
    : false;
  const decision = resolveAdvancedQuery(params.q ?? "", entitled);
  params.q = decision.q;
  const advancedDegraded = decision.degraded;
  const pool = getPool();
  const result = await searchUnified(pool, params);
  return NextResponse.json({
    ...result,
    page_size: result.pageSize,
    ...(advancedDegraded ? { advanced_degraded: true as const } : {}),
  });
});
