/**
 * GET /api/user/enterprise/evidence/:id/file — 回证据文件字节（鉴权 + 归属校验）
 *
 * @module app/api/user/enterprise/evidence/[id]/file/route
 */
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { createEnterpriseProfileRepo, getEvidenceFile } from "@/lib/services/enterprise-profile";

function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "evidence";
  return base.replace(/[^\w.\-()（） ]/g, "_").slice(0, 120) || "evidence";
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const evidenceId = Number(id);
  if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的证据 ID");
  }
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const file = await getEvidenceFile(repo, auth.userId, evidenceId);
  return new Response(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(safeFilename(file.filename))}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
