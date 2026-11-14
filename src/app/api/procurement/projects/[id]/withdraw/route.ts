/**
 * POST /api/procurement/projects/[id]/withdraw — 撤回/取消（授权书第五条书面撤回权）
 *
 * @module app/api/procurement/projects/[id]/withdraw/route
 * @description closed/withdrawn + 同事务撤搜索投影 + 守护销账 + tender 置 cancelled。
 *              撤回后供应商面（广场/搜索/详情）随投影删除收敛。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID } from "@/shared/constants/api";
import { withdrawProject } from "@/lib/services/procurement/tender";

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
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const result = await withdrawProject(getPool(), {
      projectId,
      buyerUserId: auth.userId,
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
          break;
        case "forbidden":
          routeError(403, EC_FORBIDDEN, "无权操作此项目");
          break;
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "当前状态不可撤回");
      }
    }
    /** 撤回结果视图 */
    const projectWithdrawnViewOf = (status: string) => ({ status });
    return NextResponse.json(projectWithdrawnViewOf(result.status));
  } catch (err) {
    console.warn("[api/procurement/projects/[id]/withdraw] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "撤回失败，请稍后重试");
  }
});
