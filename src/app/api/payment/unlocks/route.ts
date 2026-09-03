/**
 * GET /api/payment/unlocks — 解锁历史（分页）
 *
 * @module app/api/payment/unlocks/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = req.nextUrl;
  const ctx = getContext();
  const { paymentHistoryRepo } = ctx.payment;

  const lang = url.searchParams.get("lang") || "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * limit;

  const [total, unlocks] = await Promise.all([
    paymentHistoryRepo.countUnlocks(auth.userId!),
    paymentHistoryRepo.listUnlocks(auth.userId!, limit, offset, lang ? { lang } : null),
  ]);
  return NextResponse.json({ total, page, limit, list: unlocks });
}
