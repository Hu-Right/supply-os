/**
 * POST /api/procurement/projects/[id]/submit — 提交 = 确认最终版本（七步流程第 2/3 步）
 *
 * @module app/api/procurement/projects/[id]/submit/route
 * @description 冻结 revision 快照（主表+明细+附件清单）→ version_no+1 → submitted。
 *              提交后本页授权书按新版本重新生成，流程进入第 4/5 步（签署）与第 6 步（核验）。
 *              前置：采购主体须已认证（2026-11-14 资格前置，与发布闸同口径）——
 *              未认证直接拦在提交，不再等到审核通过才打回。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
  EC_INVALID_PARAMS,
  EC_RFQ_AUTHORIZATION_REQUIRED,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { isProjectOwnedBy, submitProject } from "@/lib/services/procurement/projects";
import { runAutoReview } from "@/lib/services/procurement/reviews";

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
        case "buyer_not_verified":
          // 与发布闸同一错误码（44005）：同一失败条件在提交/发布两处口径一致，前端归类不变。
          // 资格校验前移的意义就在这句提示——别再让用户签完授权书、等完审核才被打回。
          routeError(
            403,
            EC_RFQ_AUTHORIZATION_REQUIRED,
            "采购主体尚未通过身份认证，不能提交需求。请先在「设置 → 采购主体认证」完成认证（可先保存草稿）。",
          );
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
    // 流程第 3 步后半：提交后立即跑系统自动初审（F04 九项），留痕供核验后台与采购方查看。
    // best-effort：初审失败不阻断提交（核验后台仍可人工补审），但必须留日志。
    try {
      await runAutoReview(pool, projectId, result.versionNo);
    } catch (reviewErr) {
      console.warn("[api/procurement/projects/[id]/submit] auto review failed:", (reviewErr as Error).message);
    }
    return NextResponse.json(projectSubmittedViewOf(result.status, result.versionNo, result.reference));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects/[id]/submit] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "提交失败，请稍后重试");
  }
});
