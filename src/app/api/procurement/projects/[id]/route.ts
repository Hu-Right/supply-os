/**
 * /api/procurement/projects/[id] — 项目详情 / 编辑
 *
 * @module app/api/procurement/projects/[id]/route
 * @description GET = 详情（owner 全量：明细/附件/核验时间线/授权状态；非 owner 仅 published
 *              且按 F02 分级授权裁剪）；PATCH = 编辑（仅 draft/need_info，只改传入字段）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID } from "@/shared/constants/api";
import { getProjectBundle, isProjectOwnedBy, updateProject } from "@/lib/services/procurement/projects";
import { projectDetailViewOf } from "@/lib/services/procurement/views";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }

  // 可选登录：未登录只能看已发布需求
  const userId = await requireUserKeyOrThrow(req)
    .then((a) => a.userId)
    .catch(() => null);

  const pool = getPool();
  const bundle = await getProjectBundle(pool, projectId);
  if (!bundle) routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
  const isOwner = userId != null && (await isProjectOwnedBy(pool, projectId, userId));
  if (!isOwner && bundle.project.status !== "published") {
    routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
  }

  /** 项目详情视图（owner 全量 / 公开裁剪） */
  const projectDetailPublicViewOf = (b: typeof bundle) => projectDetailViewOf(b, { isOwner });
  return NextResponse.json(projectDetailPublicViewOf(bundle));
});

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
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
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权操作此项目");
  }

  try {
    const result = await updateProject(pool, { projectId, fields: body });
    if (!result.ok) {
      if (result.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
      routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或待补充状态可编辑");
    }
    // 一个字段都没命中 → 视为客户端契约错误（防止再次出现"静默丢字段"）
    if (result.changed === 0) routeError(400, EC_INVALID_PARAMS, "没有可更新的需求字段");
    /** 编辑结果视图 */
    const projectPatchedViewOf = (changed: number) => ({ changed });
    return NextResponse.json(projectPatchedViewOf(result.changed));
  } catch (err) {
    console.warn("[api/procurement/projects/[id]] patch failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "保存失败，请稍后重试");
  }
});
