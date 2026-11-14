/**
 * POST /api/procurement/projects/[id]/copy — 复制历史采购单为新草稿（F02）
 *
 * @module app/api/procurement/projects/[id]/copy/route
 * @description 复制主表可编辑字段 + 标包 + 明细（不复制附件），新单编号/版本归零、
 *              状态 draft，后续编辑/提交/签署/核验从零开始。来源单必须属于当前采购主体。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND } from "@/shared/constants/api";
import { getBuyerIdByUserId } from "@/lib/services/procurement/buyers";
import { copyProjectAsDraft } from "@/lib/services/procurement/projects";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const sourceProjectId = Number(id);
  if (!Number.isFinite(sourceProjectId) || sourceProjectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }
  const pool = getPool();
  const buyerId = await getBuyerIdByUserId(pool, auth.userId);
  if (!buyerId) routeError(400, EC_INVALID_PARAMS, "请先完善采购主体认证信息");

  const result = await copyProjectAsDraft(pool, { sourceProjectId, buyerId });
  if (!result.ok) routeError(404, EC_RFQ_NOT_FOUND, "源项目不存在或不属于当前主体");
  /** 复制结果视图 */
  const projectCopiedViewOf = (pid: number, reference: string) => ({ id: pid, reference });
  return NextResponse.json(projectCopiedViewOf(result.projectId, result.reference));
});
