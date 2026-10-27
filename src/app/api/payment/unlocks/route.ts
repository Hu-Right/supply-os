/**
 * GET /api/payment/unlocks — 解锁历史（分页）
 *
 * 响应体走 lib/services/payment-history-view（平铺行→嵌套 camel），
 * 本路由不再把 repo 行整行透出。
 *
 * @module app/api/payment/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";
import { toUnlockRecordViews } from "@/lib/services/payment-history-view";

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
  return NextResponse.json({ total, page, limit, list: toUnlockRecordViews(unlocks) });
});
