/**
 * POST /api/auth/mfa/enable — 验证动态码并启用两步验证（返回一次性恢复码）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { enableMfa } from "@/lib/services/mfa";
import { mfaEnableViewOf } from "@/lib/services/mfa/view";

const schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "请输入 6 位动态码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, schema);
  const { recoveryCodes } = await enableMfa(getContext().dbPool, auth.userId, body.code);
  return NextResponse.json(mfaEnableViewOf(recoveryCodes));
});

