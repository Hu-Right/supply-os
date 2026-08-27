/**
 * GET /api/suppliers/[id]/contact — 获取供应商联系方式（需认证+VIP）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";
import { resolveMembershipState } from "@/server/services/membership-status";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const supplierId = Number(id);
  if (!supplierId) return NextResponse.json({ code: 40000, message: "Invalid ID" }, { status: 400 });

  const ctx = getContext();
  const { directoryRepo } = ctx.supplier;

  // VIP 校验
  const memberState = await resolveMembershipState(ctx.user.membershipRepo, auth.userKey);
  if (memberState.tier === "free") {
    return NextResponse.json({ code: 40003, message: "需要 VIP 会员才能查看联系方式" }, { status: 403 });
  }

  const contact = await directoryRepo.findContact(supplierId);
  if (!contact) return NextResponse.json({ code: 40044, message: "供应商不存在" }, { status: 404 });

  return NextResponse.json(contact);
}
