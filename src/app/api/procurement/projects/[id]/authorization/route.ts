/**
 * /api/procurement/projects/[id]/authorization — 授权书签署与状态（七步流程第 4/5 步）
 *
 * @module app/api/procurement/projects/[id]/authorization/route
 * @description GET = 当前版本授权书内容哈希与最新签署状态（打印页消费）；
 *              POST = 上传签字盖章扫描件 + 在线确认签署（一次动作）。版本绑定：
 *              versionNo/letterHash 必须匹配当前版本——改稿重提旧签署自动失效。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID, EC_RFQ_VERSION_CONFLICT } from "@/shared/constants/api";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";
import { getAuthorizationStatus, signAuthorization } from "@/lib/services/procurement/authorization";

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
    routeError(403, EC_FORBIDDEN, "无权查看此项目的授权信息");
  }
  const status = await getAuthorizationStatus(pool, projectId);
  if (!status) routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");

  /** 授权状态视图 */
  const authorizationStatusViewOf = (s: NonNullable<typeof status>) => ({
    letterHash: s.letterHash,
    versionNo: s.versionNo,
    status: s.status,
    signerName: s.signerName,
    signedAt: s.signedAt,
    rejectReason: s.rejectReason,
  });
  return NextResponse.json(authorizationStatusViewOf(status));
});

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const signerName = String(formData.get("signerName") || "").trim();
  const letterHash = String(formData.get("letterHash") || "").trim();
  const versionNo = Number(formData.get("versionNo") || 0);

  if (!file) routeError(400, EC_INVALID_PARAMS, "请上传签字盖章的扫描件");
  if (!signerName || signerName.length > 128) routeError(400, EC_INVALID_PARAMS, "请填写授权代表姓名（≤128 字）");
  if (!/^[0-9a-f]{64}$/i.test(letterHash)) routeError(400, EC_INVALID_PARAMS, "授权书内容哈希缺失");
  if (!Number.isFinite(versionNo) || versionNo <= 0) routeError(400, EC_INVALID_PARAMS, "需求版本缺失");

  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权签署此项目的授权书");
  }

  try {
    const result = await signAuthorization(pool, {
      projectId,
      signerUid: auth.userId,
      signerName,
      letterHash,
      versionNo,
      scan: { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type },
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
    });
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
          break;
        case "version_conflict":
          routeError(409, EC_RFQ_VERSION_CONFLICT, "需求版本已变化，请重新打开授权书页面下载并签署最新版");
          break;
        case "letter_mismatch":
          routeError(400, EC_INVALID_PARAMS, "授权书内容与当前版本不符，请重新打开授权书页面后再签署");
          break;
        case "not_signable":
          routeError(409, EC_RFQ_STATE_INVALID, "项目当前状态不可签署授权书（请先提交审核）");
          break;
        case "bad_file":
          routeError(400, EC_INVALID_PARAMS, "扫描件格式/大小不符（jpg/png/webp/pdf，≤10MB）");
          break;
        default:
          routeError(400, EC_INVALID_PARAMS, "请填写授权代表姓名（≤128 字）");
      }
    }
    /** 签署结果视图 */
    const authorizationSignedViewOf = (aid: number, fileUrl: string) => ({ id: aid, status: "pending", fileUrl });
    return NextResponse.json(authorizationSignedViewOf(result.id, result.fileUrl));
  } catch (err) {
    console.warn("[api/procurement/projects/[id]/authorization] sign failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "签署提交失败，请稍后重试");
  }
});
