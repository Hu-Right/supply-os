/**
 * POST /api/procurement/projects/[id]/submit — 提交 = 确认最终版本（七步流程第 2/3 步）
 *
 * @module app/api/procurement/projects/[id]/submit/route
 * @description 冻结 revision 快照（主表+明细+附件清单）→ version_no+1 → submitted。
 *              提交后本页授权书按新版本重新生成，流程进入第 4/5 步（签署）与第 6 步（核验）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { isProjectOwnedBy, submitProject } from "@/lib/services/procurement/projects";

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

  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权操作此项目");
  }

  try {
    const result = await submitProject(pool, { projectId, confirmedBy: auth.userId });
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
          break;
        case "empty_items":
          routeError(400, EC_INVALID_PARAMS, "至少需要一条采购明细才能提交");
          break;
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "当前状态不可提交");
      }
    }
    /** 提交结果视图 */
    const projectSubmittedViewOf = (status: string, versionNo: number, reference: string) => ({
      status,
      versionNo,
      reference,
    });
    return NextResponse.json(projectSubmittedViewOf(result.status, result.versionNo, result.reference));
  } catch (err) {
    console.warn("[api/procurement/projects/[id]/submit] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "提交失败，请稍后重试");
  }
});
