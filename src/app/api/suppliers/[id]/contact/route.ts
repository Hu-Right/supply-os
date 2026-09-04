/**
 * GET /api/suppliers/[id]/contact — 获取供应商联系方式（需认证+VIP）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { resolveMembershipState } from "@/lib/services/membership-status";
import { MEMBERSHIP_TIER } from "@/shared/constants/membership";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    // mapSupplierRow 产出的 id 带 sup-db- 前缀（区分数据源），此处剥离后取数字主键
    const rawId = id.startsWith("sup-db-") ? id.slice("sup-db-".length) : id;
    const supplierId = Number(rawId);
    if (!supplierId) routeError(400, 40000, "无效的供应商 ID");

    const ctx = getContext();
    const { directoryRepo } = ctx.supplier;

    // VIP 校验
    const memberState = await resolveMembershipState(ctx.user.membershipRepo, auth.userId);
    if (memberState.tier === MEMBERSHIP_TIER.FREE) {
      routeError(403, 40003, "需要 VIP 会员才能查看联系方式");
    }

    const contact = await directoryRepo.findContact(supplierId);
    if (!contact) routeError(404, 40044, "供应商不存在");

    // 字段名映射：DB 列名 → 前端期望字段
    return NextResponse.json({
      contactPerson: contact.contact || "",
      contactPhone: contact.phone || "",
      contactEmail: contact.email || "",
    });
  },
);
