/**
 * GET /api/procurement/projects/[id]/matches — 发布即匹配候选名单（七步流程第 7 步）
 *
 * @module app/api/procurement/projects/[id]/matches/route
 * @description 仅归属人可见。候选在发布成功后由 generateMatchCandidates 规则生成
 *              （行业 L1 + 省份优先，仅平台核验供应商）；本接口只读不触发。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS } from "@/shared/constants/api";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";
import { listMatchCandidates } from "@/lib/services/procurement/matching";
import { matchListViewOf } from "@/lib/services/procurement/views";

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
  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权查看此项目的匹配名单");
  }

  try {
    const list = await listMatchCandidates(pool, projectId);
    return NextResponse.json(matchListViewOf(list));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects/[id]/matches] load failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "加载匹配名单失败，请稍后重试");
  }
});
