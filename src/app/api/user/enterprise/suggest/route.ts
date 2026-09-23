/**
 * /api/user/enterprise/suggest — 企业名称认领建议（登录态）
 *
 * GET ?name=xxx：供应商库中已认证企业的候选列表（公司名前缀命中优先，最多 5 条）。
 * 供企业信息填写页提示「库内已有认证企业，去认领」；只返回公开字段（公司/国家/行业），
 * 不含联系人信息。防爬：登录态 + 限流 + 名称 2-100 字符。
 *
 * @module app/api/user/enterprise/suggest/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  // 输入联想型限流：正常打字远够用，批量枚举目录会被掐断
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 60 }, () => `ent-suggest:${auth.userId}`);
  if (rl) return rl;

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 100) {
    routeError(400, EC_INVALID_PARAMS, "企业名称需为 2-100 个字符");
  }

  const ctx = getContext();
  const matches = await ctx.supplier.directoryRepo.findVerifiedByNameSimilar(name, 5);
  return NextResponse.json({ code: 0, message: "ok", data: { matches } });
});
