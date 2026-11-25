/**
 * POST /api/auth/mfa/disable — 关闭两步验证（需动态码或恢复码）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { disableMfa } from "@/lib/services/mfa";

const schema = z.object({
  code: z.string().trim().min(6, "请输入动态码或恢复码").max(20),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, schema);
  await disableMfa(getContext().dbPool, auth.userId, body.code);
  return NextResponse.json({ success: true });
});
