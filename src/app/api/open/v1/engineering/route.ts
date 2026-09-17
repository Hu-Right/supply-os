/**
 * GET /api/open/v1/engineering — 工程类商机列表（开放 API）
 *
 * @module app/api/open/v1/engineering/route
 * @description 对外开放 API 端点，返回工程类采购商机数据。
 *              认证方式：X-API-Key 请求头。
 *              分档返回：basic 档返回基础元数据，pro 档返回完整数据。
 *              每次调用记录用量。
 *
 * 查询参数：
 * - page: 页码（默认 1）
 * - limit: 每页条数（默认 20，最大 50）
 * - country: 国家筛选
 * - notice_type: 采购方式筛选
 * - deadline_from: 截止日期起始（YYYY-MM-DD）
 * - deadline_to: 截止日期结束（YYYY-MM-DD）
 * - keyword: 标题关键词搜索
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { authenticateOpenApiKey } from "@/lib/middleware/open-api-auth";
import { queryEngineeringList, getEngineeringStats } from "@/lib/services/open-api/engineering";
import { extractClientIp } from "@/lib/utils/ip";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = getContext();
  const repo = ctx.openApiRepo;

  // API Key 认证
  const auth = await authenticateOpenApiKey(req, repo);
  if (auth instanceof NextResponse) return auth;

  const url = req.nextUrl;

  // 特殊端点：stats（统计数据）
  if (url.searchParams.get("stats") === "1") {
    const stats = await getEngineeringStats(ctx.dbPool);
    await repo.recordUsage(auth.keyId, "engineering/stats", auth.tier, 200, extractClientIp(req));
    return NextResponse.json(stats);
  }

  // 解析分页参数
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_PAGE_LIMIT));
  const country = url.searchParams.get("country") || undefined;
  const noticeType = url.searchParams.get("notice_type") || undefined;
  const deadlineFrom = url.searchParams.get("deadline_from") || undefined;
  const deadlineTo = url.searchParams.get("deadline_to") || undefined;
  const keyword = url.searchParams.get("keyword") || undefined;

  const result = await queryEngineeringList(ctx.dbPool, {
    page,
    limit,
    country,
    noticeType,
    deadlineFrom,
    deadlineTo,
    keyword,
  }, auth.tier);

  // 记录用量
  await repo.recordUsage(auth.keyId, "engineering/list", auth.tier, 200, extractClientIp(req));

  return NextResponse.json({
    total: result.total,
    page: result.page,
    limit: result.limit,
    tier: auth.tier,
    items: result.items,
  });
});
