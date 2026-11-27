/**
 * 账号注销：发送身份验证码
 *
 * POST /api/user/account-deletion/code — 给绑定手机/邮箱发注销验证码（10 分钟有效）
 *
 * @module app/api/user/account-deletion/code/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { sendDeletionCode } from "@/lib/services/account-deletion";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const limited = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 5 }, () => `deletion-code:${auth.userId}`);
  if (limited) return limited;
  try {
    const result = await sendDeletionCode(getContext().dbPool, auth.userId, extractClientIp(req));
    return NextResponse.json({ channel: result.channel, expiresInSeconds: result.expiresInSeconds });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_NO_CHANNEL") {
      routeError(400, EC_INVALID_PARAMS, (err as Error).message);
    }
    routeError(500, EC_INTERNAL_ERROR, "验证码发送失败，请稍后重试或联系客服");
  }
});
