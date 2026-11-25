/**
 * POST /api/auth/mfa/setup — 发起两步验证绑定（返回 otpauth URI 与二维码）
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { startMfaSetup } from "@/lib/services/mfa";
import { mfaSetupViewOf } from "@/lib/services/mfa/view";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 10 }, (r) => `mfa-setup:${extractClientIp(r)}`);
  if (rl) return rl;
  const ctx = getContext();
  const user = await ctx.user.usersRepo.findById(auth.userId);
  const accountLabel = user?.email || user?.phone || `user-${auth.userId}`;
  const { secret, otpauthUri } = await startMfaSetup(ctx.dbPool, auth.userId, accountLabel);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  return NextResponse.json(mfaSetupViewOf({ secret, otpauthUri, qrDataUrl }));
});



