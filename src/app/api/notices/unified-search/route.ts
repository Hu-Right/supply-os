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
import { resolveIndustryScope } from "@/lib/services/industry-scope";

/** 日期形参须长这样才入库 filters（与旧 Express 版 /api/notices/search 同规则） */
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

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
  // 行业墙（2026-09-29「8,800元/行业」口径）：企业年度会员（industry_scoped 档）只能浏览
  // 其绑定一级类目下的公告。强制过滤由服务端注入 forcedLevel1Id（客户端传参不可覆盖）；
  // 匿名/普通档不墙，演示档走 all_category_access 旁路，被墙档未绑行业暂不墙（needsIndustry 引导）。
  const scope = await resolveIndustryScope(getPool(), ctx.benefitSystemRepo, auth.userId || null);
  if (scope.scoped) {
    params.forcedLevel1Id = String(scope.level1Id);
    // 被墙用户的推荐流收编进 prefs 管道（其行业画像必然存在——被墙前提是已绑行业），
    // 保证强制过滤对推荐结果同样生效
    if (params.mode === "recommended") params.mode = "prefs";
  }
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

  // 搜索行为日志（2026-09-30 影子新表，仅登录用户，user_id NOT NULL）：带条件的检索入库，
  // 推荐/空载不计；记录的是实际执行的 q（高级语法剥离后）。fire-and-forget，失败静默不阻塞响应
  const hasSearch = Boolean(
    params.q || params.country || params.agency ||
    DATE_RE.test(params.deadlineFrom ?? "") || DATE_RE.test(params.deadlineTo ?? "") ||
    params.deadlineWithinDays || params.noticeType || params.featuredOnly,
  );
  if (auth.userId && hasSearch) {
    const filters = JSON.stringify({
      mode: params.mode,
      page: params.page != null && params.page > 1 ? params.page : undefined,
      code_id: params.codeId || undefined,
      agency: params.agency || undefined,
      budget_min: Number.isFinite(params.budgetMin) ? params.budgetMin : undefined,
      budget_max: Number.isFinite(params.budgetMax) ? params.budgetMax : undefined,
      match_mode: params.matchMode === "any" ? "any" : undefined,
      deadline_from: DATE_RE.test(params.deadlineFrom ?? "") ? params.deadlineFrom : undefined,
      deadline_to: DATE_RE.test(params.deadlineTo ?? "") ? params.deadlineTo : undefined,
      deadline_within_days: params.deadlineWithinDays || undefined,
      notice_type: params.noticeType || undefined,
      featured: params.featuredOnly || undefined,
      sort: params.sort,
      forced_level1_id: params.forcedLevel1Id || undefined,
      advanced_degraded: advancedDegraded || undefined,
      match_relaxed: result.match_relaxed || undefined,
      fallback: result.fallback || undefined,
      variant: result.variant || undefined,
    });
    void ctx.notice.feedbackRepo
      .logSearch(auth.userId, params.q || null, params.country || null, filters, result.total)
      .catch(() => undefined);
  }

  return NextResponse.json({
    ...result,
    page_size: result.pageSize,
    ...(advancedDegraded ? { advanced_degraded: true as const } : {}),
    ...(scope.needsIndustry ? { needs_industry_selection: true as const } : {}),
  });
});
