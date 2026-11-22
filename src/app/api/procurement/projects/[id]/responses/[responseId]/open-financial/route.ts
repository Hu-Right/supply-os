/**
 * /api/procurement/projects/[id]/responses/[responseId]/open-financial — 开商务封（POST）
 *
 * @module app/api/procurement/projects/[id]/responses/[responseId]/open-financial/route
 * @description RFP 双信封时序的关键闸口（§7.3）：技术总分 ≥ 冻结门槛线才允许开封该响应的
 *              商务标；开封后该响应价格对采购方可见（列表/比价/排名联动）。幂等：重复开封
 *              返回首次开封时间。未开封的响应价格在列表/比价/排名面均为 null。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_ENVELOPE_SEALED,
  EC_RFQ_EVAL_STAGE_NOT_PERMITTED,
  EC_RFQ_EVAL_TEMPLATE_REQUIRED,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { openFinancialEnvelope } from "@/lib/services/procurement/evaluations";

interface Ctx {
  params: Promise<{ id: string; responseId: string }>;
}

function parseNum(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) routeError(400, EC_INVALID_PARAMS, `无效的 ${label}`);
  return n;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id, responseId } = await params;
  const projectId = parseNum(id, "项目 ID");
  const respId = parseNum(responseId, "响应 ID");

  const result = await openFinancialEnvelope(getPool(), {
    projectId,
    buyerUserId: auth.userId,
    responseId: respId,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权操作该项目");
        break;
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "项目或响应不存在");
        break;
      case "response_invalid":
        routeError(409, EC_RFQ_RESPONSE_NOT_FOUND, "响应状态不允许开封");
        break;
      case "tender_not_open":
        routeError(409, EC_RFQ_STATE_INVALID, "尚未收标开封，不能开商务封");
        break;
      case "method_invalid":
        routeError(409, EC_RFQ_STATE_INVALID, "当前采购方式不使用双信封");
        break;
      case "template_missing":
        routeError(400, EC_RFQ_EVAL_TEMPLATE_REQUIRED, "尚未冻结评分模板，无法判定技术门槛");
        break;
      case "stage_not_permitted":
        routeError(409, EC_RFQ_EVAL_STAGE_NOT_PERMITTED, "该响应尚未进行技术评审");
        break;
      case "tech_not_passed":
        routeError(409, EC_RFQ_ENVELOPE_SEALED, "技术评审未达门槛线，商务标保持密封");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许开封");
    }
  }

  /** 开封结果视图 */
  const openedViewOf = (r: Extract<typeof result, { ok: true }>) => ({ openedAt: r.openedAt });
  return NextResponse.json(openedViewOf(result));
});
