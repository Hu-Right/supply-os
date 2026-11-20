/**
 * GET /api/industries/infer — 行业关键词推断（UGT-I 行业树）
 *
 * @module app/api/industries/infer/route
 * @description 设置页「所属行业」选择器：输入关键词 → 行业节点候选（只产候选，不自动回填）。
 *              与品目推断（/api/commodity/smart-infer，UGT 骨架树）是两套独立树，不互相推导。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { inferIndustryNodes } from "@/lib/services/industry/infer";

export const GET = withRoute(async (req: NextRequest) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `industry-infer:${extractClientIp(req)}`);
  if (rl) return rl;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  if (!q) routeError(400, EC_INVALID_PARAMS, "缺少关键词 q");

  const candidates = await inferIndustryNodes(getPool(), q);
  return NextResponse.json(
    {
      candidates: candidates.map((c) => ({
        code: c.code,
        nameZh: c.nameZh,
        nameEn: c.nameEn,
        level: c.level,
        score: c.score,
        path: c.path,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});