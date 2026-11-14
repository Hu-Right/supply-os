/**
 * POST /api/rfq/demands/[id]/withdraw — 撤回需求（→ closed/cancelled，同事务撤搜索投影）
 *
 * @module app/api/rfq/demands/[id]/withdraw/route
 * @description v1 的 /api/rfq/[id]/withdraw 随 595bfe75 删除后未在 demands 下重建，而
 *              工作台「撤回」按钮仍在调用（2026-11-14 审计 P0 断链），本路由补齐。
 *              动作本体在 closeDemand：状态转移与投影下架同事务，撤投影即从公开面退场
 *              （宽表/Meili 由既有 ghost 清退链收敛）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { closeDemand } from "@/lib/services/rfq/close";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const result = await closeDemand(getPool(), {
    demandId,
    buyerUserId: auth.userId,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
        break;
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权操作此需求");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "需求当前状态不可撤回");
    }
  }

  return NextResponse.json({ status: result.status });
});
