/**
 * GET /api/payment/unlocks — 解锁历史（分页）
 *
 * @module app/api/payment/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const url = req.nextUrl;
  const ctx = getContext();
  const { paymentHistoryRepo } = ctx.payment;

  const lang = url.searchParams.get("lang") || "";
  const limit = clampLimit(url.searchParams.get("limit"), DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * limit;

  const [total, unlocks] = await Promise.all([
    paymentHistoryRepo.countUnlocks(auth.userId),
    paymentHistoryRepo.listUnlocks(auth.userId, limit, offset, lang ? { lang } : null),
  ]);
  return NextResponse.json({ total, page, limit, list: unlocks });
});
