/**
 * POST /api/rfq/demands/[id]/submit — 提交审核（draft/rejected → submitted）
 *
 * @module app/api/rfq/demands/[id]/submit/route
 * @description v2 发布链入口。v1 的 /api/rfq/[id]/submit 随 595bfe75 删除后，本端点
 *              未在 demands 下重建，而向导（RfqWizard）与工作台编辑页仍在调用——
 *              发布链对用户不可达（2026-11-14 审计 P0 断链），本路由补齐。
 *              动作本体在 submitDemand：版本快照 + 审核工单入队 + 状态转移，同事务原子完成。
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
import { submitDemand } from "@/lib/services/rfq/submit";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const result = await submitDemand(getPool(), {
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
      case "not_editable":
        routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或审核未通过的需求可提交审核");
        break;
      default:
        routeError(400, EC_INVALID_PARAMS, result.errors?.[0]?.message || "需求信息不完整，无法提交审核", {
          errors: result.errors ?? [],
        });
    }
  }

  return NextResponse.json({
    status: result.status,
    version: result.version,
    already: result.already === true,
  });
});
