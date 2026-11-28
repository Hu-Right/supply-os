/**
 * POST /api/procurement/projects/[id]/extend-deadline — 延长报价截止（市场型方式 rfq/eoi 专属）
 *
 * @module app/api/procurement/projects/[id]/extend-deadline/route
 * @description 发布后的采购方自主顺延：同事务顶 tender.deadline_at / projects.quote_deadline_at /
 *              bid_notices 投影（update_time 顶水位），并留 deadline_extended 审计事件 + 站内通知。
 *              itb/rfp 的延期走招标文件补遗（qa_addendum）通道，本入口按 409 拒绝并说明。
 *              body: { deadlineAt: number }（epoch 秒；必须晚于当前时刻与现截止，上限 now+365 天）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID } from "@/shared/constants/api";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extendProjectDeadline } from "@/lib/services/procurement/tender";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }

  const rl = checkRateLimit(
    req,
    { windowMs: 10 * 60_000, maxAttempts: 10 },
    () => `procurement-extend-deadline:${auth.userId}`,
  );
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const deadlineAt = Number(body.deadlineAt);
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
    routeError(400, EC_INVALID_PARAMS, "请提供有效的 deadlineAt（epoch 秒）");
  }

  try {
    const result = await extendProjectDeadline(getPool(), {
      projectId,
      buyerUserId: auth.userId,
      newDeadlineAt: deadlineAt,
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
          break;
        case "invalid_deadline":
          routeError(
            400,
            EC_INVALID_PARAMS,
            "新的截止时间无效：必须晚于当前时刻与现截止时间（只可顺延），且不超过一年",
          );
          break;
        case "method_not_allowed":
          routeError(
            409,
            EC_RFQ_STATE_INVALID,
            "该采购方式（ITB/RFP）的截止时间调整须通过发布招标文件补遗（qa_addendum）进行，不能直接延长",
          );
          break;
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "仅已发布且未截标的需求可延长截止时间");
      }
    }
    /** 延长截止结果视图 */
    const deadlineExtendedViewOf = (r: { tenderId: number; oldDeadlineAt: number; newDeadlineAt: number }) => ({
      status: "published",
      tenderId: r.tenderId,
      oldDeadlineAt: r.oldDeadlineAt,
      newDeadlineAt: r.newDeadlineAt,
    });
    return NextResponse.json(deadlineExtendedViewOf(result));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects/[id]/extend-deadline] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "延长截止失败，请稍后重试");
  }
});
