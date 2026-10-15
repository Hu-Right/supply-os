/**
 * GET /api/commodity/smart-infer — 品目智能推断（UGT 树内匹配）
 *
 * @description 主营业务关键词 → 骨架树节点候选。取代旧字典版的 smart-infer 路由
 *   （旧实现读旧品类字典，随字典退役下线）。只返回候选，不做自动回填：
 *   推断错误会污染行业偏好，由用户在界面上点选确认。候选的 code 就是骨架节点码，
 *   所属大类由前端按码前缀切片点亮级联第一级（2026-10-15 G 码退役，候选不再带大类码）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { smartInferCommodityNodes } from "@/lib/services/commodity/infer";

export const GET = withRoute(async (req: NextRequest) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `commodity-infer:${extractClientIp(req)}`);
  if (rl) return rl;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (!q) routeError(400, EC_INVALID_PARAMS, "缺少关键词 q");

  const candidates = await smartInferCommodityNodes(getContext().dbPool, q);
  return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
});
