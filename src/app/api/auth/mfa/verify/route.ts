/**
 * POST /api/auth/mfa/verify — 登录第二步：校验动态码/恢复码，通过后签发正式 token
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { verifyMfaChallenge } from "@/lib/services/jwt";
import { buildUserResponse, issueTokenPair } from "@/lib/services/auth";
import { verifyMfaForLogin } from "@/lib/services/mfa";
import { mfaLoginViewOf } from "@/lib/services/mfa/view";
import { cancelCoolingDeletion } from "@/lib/services/account-deletion";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";
import { EC_AUTH_REQUIRED } from "@/shared/constants/api";

const schema = z.object({
  challengeToken: z.string().trim().min(10, "登录校验已过期"),
  code: z.string().trim().min(6, "请输入动态码或恢复码").max(20),
});

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, schema);

  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 10 }, (r) => `mfa-verify:${extractClientIp(r)}`);
  if (rl) return rl;

  let uid: number;
  try {
    ({ uid } = verifyMfaChallenge(body.challengeToken));
  } catch {
    return routeError(401, EC_AUTH_REQUIRED, "登录校验已过期，请重新登录");
  }

  const ctx = getContext();
  await verifyMfaForLogin(ctx.dbPool, uid, body.code);
  const user = await ctx.user.usersRepo.findById(uid);
  if (!user) return routeError(401, EC_AUTH_REQUIRED, "账号不存在或已失效");

  const payload = await buildUserResponse(user, ctx.benefitSystemRepo, ctx.supplier.directoryRepo);
  const tokens = await issueTokenPair(ctx.user.authRepo, uid);
  // 冷静期内完成登录 → 撤销注销申请
  void cancelCoolingDeletion(ctx.dbPool, uid).catch((e) => {
    console.error("[account-deletion] 登录撤销冷静期失败:", (e as Error).message);
  });
  const response = NextResponse.json(mfaLoginViewOf(payload, tokens.token, tokens.refreshToken));
  setRefreshCookieOnResponse(response, tokens.refreshToken);
  return response;
});


