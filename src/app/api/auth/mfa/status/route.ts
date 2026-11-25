/**
 * GET /api/auth/mfa/status — 当前登录账号的两步验证状态
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { getMfaStatus } from "@/lib/services/mfa";
import { mfaStatusViewOf } from "@/lib/services/mfa/view";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const status = await getMfaStatus(getContext().dbPool, auth.userId);
  return NextResponse.json(mfaStatusViewOf(status));
});

