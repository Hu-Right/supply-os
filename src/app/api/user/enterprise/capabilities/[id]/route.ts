/**
 * DELETE /api/user/enterprise/capabilities/:id — 删除企业能力项
 *
 * @module app/api/user/enterprise/capabilities/[id]/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { createEnterpriseProfileRepo, removeCapability } from "@/lib/services/enterprise-profile";

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const capabilityId = Number(id);
  if (!Number.isInteger(capabilityId) || capabilityId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的能力项 ID");
  }
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  await removeCapability(repo, auth.userId, capabilityId);
  return NextResponse.json({ deleted: true });
});
