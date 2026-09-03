/**
 * GET /api/suppliers/[id]/contact — 获取供应商联系方式（需认证+VIP）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { resolveMembershipState } from "@/lib/services/membership-status";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  // mapSupplierRow 产出的 id 带 sup-db- 前缀（区分数据源），此处剥离后取数字主键
  const rawId = id.startsWith("sup-db-") ? id.slice("sup-db-".length) : id;
  const supplierId = Number(rawId);
  if (!supplierId) return NextResponse.json({ code: 40000, message: "无效的供应商 ID" }, { status: 400 });

  const ctx = getContext();
  const { directoryRepo } = ctx.supplier;

  // VIP 校验
  const memberState = await resolveMembershipState(ctx.user.membershipRepo, auth.userId!);
  if (memberState.tier === "free") {
    return NextResponse.json({ code: 40003, message: "需要 VIP 会员才能查看联系方式" }, { status: 403 });
  }

  const contact = await directoryRepo.findContact(supplierId);
  if (!contact) return NextResponse.json({ code: 40044, message: "供应商不存在" }, { status: 404 });

  // 字段名映射：DB 列名 → 前端期望字段
  return NextResponse.json({
    contactPerson: contact.contact || "",
    contactPhone: contact.phone || "",
    contactEmail: contact.email || "",
  });
}
