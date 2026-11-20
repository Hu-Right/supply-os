/**
 * /api/procurement/projects/[id]/award — 定标（POST）与定标结果（GET）
 *
 * @module app/api/procurement/projects/[id]/award/route
 * @description POST = 采购方定标（单家中标，理由 ≥10 字；同事务撤投影、结案、通知）；
 *              GET = 归属人或参与响应的供应商查看定标结果。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_AWARD_EXISTS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_NOT_OPENED,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { awardResponse, getAward } from "@/lib/services/procurement/awards";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";
import { resolveSupplierIdForUser } from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseProjectId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  return id;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }
  const responseId = Number(body.responseId ?? 0);
  const reason = String(body.reason ?? "").trim();
  if (!Number.isFinite(responseId) || responseId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的响应 ID");
  if (reason.length < 10) routeError(400, EC_INVALID_PARAMS, "定标理由需不少于 10 个字");

  const result = await awardResponse(getPool(), { projectId, buyerUserId: auth.userId, responseId, reason });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权为该需求定标");
        break;
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "采购需求或响应不存在");
        break;
      case "not_opened":
        routeError(409, EC_RFQ_NOT_OPENED, "尚未开标，不能定标");
        break;
      case "award_exists":
        routeError(409, EC_RFQ_AWARD_EXISTS, "该项目已定标");
        break;
      case "response_invalid":
        routeError(409, EC_RFQ_RESPONSE_NOT_FOUND, "响应状态不允许定标");
        break;
      case "use_shortlist":
        routeError(409, EC_RFQ_STATE_INVALID, "意向征集（EOI）不授标：请改用短名单接口形成入围名单");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许定标");
    }
  }

  return NextResponse.json({ ok: true, awardId: result.awardId, supplierId: result.supplierId, amount: result.amount });
});

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);
  const pool = getPool();

  let allowed = await isProjectOwnedBy(pool, projectId, auth.userId);
  if (!allowed) {
    const supplierId = await resolveSupplierIdForUser(pool, auth.userId);
    if (supplierId) {
      const [rows] = await pool.query(
        "SELECT id FROM procurement_responses WHERE project_id = ? AND supplier_id = ? LIMIT 1",
        [projectId, supplierId],
      );
      allowed = (rows as unknown[]).length > 0;
    }
  }
  if (!allowed) routeError(403, EC_FORBIDDEN, "无权查看定标结果");

  const award = await getAward(pool, projectId);
  if (!award) routeError(404, EC_RFQ_NOT_FOUND, "尚未定标");
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