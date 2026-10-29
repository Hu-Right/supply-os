/**
 * DELETE /api/user/enterprise/evidence/:id — 删除企业证据（元数据行；文件字节保留在 upload_files 供审计）
 *
 * @module app/api/user/enterprise/evidence/[id]/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { createEnterpriseProfileRepo, removeEvidence } from "@/lib/services/enterprise-profile";

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const evidenceId = Number(id);
  if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的证据 ID");
  }
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  await removeEvidence(repo, auth.userId, evidenceId);
  return NextResponse.json({ deleted: true });
});
