/**
 * GET /api/membership/plans — 套餐列表（公开）
 *
 * V2（2026-09-21）：返回启用中的订阅套餐（free + 个人体验/标准/专业 + 企业年度），
 * 每行含 benefit_rank（功能门控档位，前端据此渲染权益）。旧的 single_99 首单特惠
 * 资格附加逻辑已随单次卡一并退役（无单次卡、无首单促销）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const ctx = getContext();
  const rows = await ctx.user.membershipRepo.findActivePlans();
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
});
