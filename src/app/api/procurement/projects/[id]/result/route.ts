/**
 * GET /api/procurement/projects/[id]/result — 中标公示（公开）
 *
 * @module app/api/procurement/projects/[id]/result/route
 * @description 仅定标后返回最小信息集（中标方、金额、理由、日期）；未定标一律 404，
 *              不暴露是否收到响应。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { getPublicAward } from "@/lib/services/procurement/awards";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }
  const award = await getPublicAward(getPool(), projectId);
  if (!award) routeError(404, EC_NOT_FOUND, "该项目暂无中标公示");
  return NextResponse.json({
    award: {
      projectId: award.projectId,
      supplierId: award.supplierId,
      company: award.company,
      amount: award.amount,
      currency: award.currency,
      reason: award.reason,
      decidedAt: award.decidedAt,
      reference: award.reference,
    },
  });
});