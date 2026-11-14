/**
 * /api/procurement/projects — 采购项目（七步流程第 2/3 步）
 *
 * @module app/api/procurement/projects/route
 * @description GET = 我的项目列表（工作台，status 过滤/分页）；POST = 创建草稿
 *              （编号 OSPR-{年}-{id} 创建即生成，限流 10 次/10 分钟）。
 *              前置：必须已有采购主体（PUT /api/procurement/buyer 先行）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INTERNAL_ERROR, EC_INVALID_PARAMS } from "@/shared/constants/api";
import { createProject, listMine } from "@/lib/services/procurement/projects";
import { getBuyerIdByUserId } from "@/lib/services/procurement/buyers";
import { projectSummaryViewOf } from "@/lib/services/procurement/views";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("page_size") || 20);

  try {
    const { items, total } = await listMine(getPool(), auth.userId, { status, page, pageSize });
    /** 我的项目列表视图 */
    const projectListViewOf = (rows: typeof items) => ({
      items: rows.map(projectSummaryViewOf),
      total,
      page,
      page_size: pageSize,
    });
    return NextResponse.json(projectListViewOf(items));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects] list failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "加载项目列表失败，请稍后重试");
  }
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const rl = checkRateLimit(
    req,
    { windowMs: 10 * 60_000, maxAttempts: 10 },
    () => `procurement-project-create:${auth.userId}`,
  );
  if (rl) return rl;

  try {
    const buyerId = await getBuyerIdByUserId(getPool(), auth.userId);
    if (!buyerId) {
      routeError(400, EC_INVALID_PARAMS, "请先完善采购主体认证信息");
    }
    const { projectId, reference } = await createProject(getPool(), { buyerId, at: Math.floor(Date.now() / 1000) });
    /** 创建结果视图 */
    const projectCreatedViewOf = (id: number, ref: string) => ({ id, reference: ref });
    return NextResponse.json(projectCreatedViewOf(projectId, reference));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects] create failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "创建项目失败，请稍后重试");
  }
});
