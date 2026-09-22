/**
 * GET /api/user/supplier-pool/search?q= — 添加前的平台目录候选预览
 *
 * @module app/api/user/supplier-pool/search/route
 * @description 返回已认证供应商候选（含"已在资源库"标记），供前端两段式添加交互：
 *              输入关键词 → 候选列表点选 → POST /api/user/supplier-pool { supplierId }。
 *              仅只读，不写入任何数据。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { searchPoolCandidates } from "@/lib/services/supplier-pool";

/** 只读搜索，限流从宽：1 分钟 20 次（输入防抖后流量很低） */
const SEARCH_RATE = { windowMs: 60_000, maxAttempts: 20 };

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(req, SEARCH_RATE, () => `pool_search:${auth.userId}`);
  if (rl) return rl;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q || q.length > 100) {
    routeError(400, EC_INVALID_PARAMS, "请提供 1-100 字的搜索关键词");
  }

  const ctx = getContext();
  const candidates = await searchPoolCandidates(ctx.dbPool, auth.userId, q, 8);
  return NextResponse.json({ code: 0, message: "ok", data: { candidates } });
});
