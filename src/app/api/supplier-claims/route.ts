/** POST /api/supplier-claims — 供应商认领（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const ctx = getContext();
  try {
    const result = await ctx.supplier.claimRepo.insertClaim({ ...body, user_key: auth.userKey });
    return NextResponse.json({ success: true, id: result, status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("[supplier-claims POST]", err);
    return NextResponse.json({ code: 50000, message: "认领失败" }, { status: 500 });
  }
}
