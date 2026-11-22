/**
 * GET /api/procurement/projects/[id]/compare — 采购方比价表（开标后）
 *
 * @module app/api/procurement/projects/[id]/compare/route
 * @description 密封期返回 44010（未开标）；开标后按项目明细展开每家报价并给出总价。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_NOT_OPENED,
} from "@/shared/constants/api";
import { compareResponses } from "@/lib/services/procurement/responses";
import { computeComprehensiveRanking } from "@/lib/services/procurement/evaluations";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }

  const result = await compareResponses(getPool(), { projectId, buyerUserId: auth.userId });
  if (!result.ok) {
    if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "无权查看该项目");
    if (result.reason === "tender_not_open") routeError(409, EC_RFQ_NOT_OPENED, "尚未开标，暂不能比价");
    routeError(404, EC_RFQ_NOT_FOUND, "采购需求不存在");
  }

  // RFP（综合评分）：附带 70/30 排名（技术分+商务开封后的财务分；未开封/未达标者不出总分）
  const ranking =
    result.tender.awardMethod === "comprehensive"
      ? await computeComprehensiveRanking(getPool(), projectId)
      : undefined;

  /** 比价响应视图 */
  const compareResponseViewOf = (
    r: Extract<typeof result, { ok: true }>,
    rank: Awaited<ReturnType<typeof computeComprehensiveRanking>> | undefined,
  ) => ({
    tender: r.tender,
    items: r.items,
    totals: r.totals,
    ...(rank ? { ranking: rank } : {}),
  });
  return NextResponse.json(compareResponseViewOf(result, ranking));
});