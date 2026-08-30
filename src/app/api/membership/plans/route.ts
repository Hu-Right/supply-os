/**
 * GET /api/membership/plans — 套餐列表（公开）
 *
 * 登录态下为 single_99 行附加 first_purchase_eligible（首单特惠资格，
 * 服务端 hasSingleUnlockRecord 判定），前端据此置灰/隐藏首单价入口；
 * 未登录不附加（保持公开负载最小）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { extractUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const ctx = getContext();
  const rows = await ctx.user.membershipRepo.findActivePlans();

  const { authViaJwt, userKey } = await extractUserKey(req);
  let eligible: boolean | null = null;
  if (authViaJwt && userKey) {
    eligible = !(await ctx.payment.paymentsRepo.hasSingleUnlockRecord(userKey));
  }

  const plans = rows.map((row) =>
    row.plan_code === "single_99" && eligible !== null
      ? { ...row, first_purchase_eligible: eligible }
      : row,
  );
  return NextResponse.json(plans, { headers: { "Cache-Control": "no-store" } });
}
