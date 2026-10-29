/**
 * GET  /api/user/enterprise/evidence — 企业证据资料列表
 * POST /api/user/enterprise/evidence — 上传证据（multipart：file + category/title/validFrom/validUntil/noExpiry）
 *
 * @module app/api/user/enterprise/evidence/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { addEvidence, createEnterpriseProfileRepo, getEnterpriseProfile } from "@/lib/services/enterprise-profile";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const data = await getEnterpriseProfile(repo, auth.userId);
  return NextResponse.json({
    evidence: data.evidence.map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      validFrom: e.validFrom,
      validUntil: e.validUntil,
      noExpiry: e.noExpiry,
      hasFile: e.hasFile,
      downloadUrl: e.downloadUrl,
    })),
  });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 上传证据");
  }
  const form = await req.formData();
  const file = form.get("file");
  const uploadFile = file instanceof File
    ? { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type, size: file.size }
    : null;

  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const created = await addEvidence(repo, auth.userId, {
    category: form.get("category"),
    title: form.get("title"),
    validFrom: form.get("validFrom"),
    validUntil: form.get("validUntil"),
    noExpiry: form.get("noExpiry") === "1" || form.get("noExpiry") === "true",
    file: uploadFile,
  });
  return NextResponse.json(
    {
      id: created.id,
      category: created.category,
      title: created.title,
      validFrom: created.validFrom,
      validUntil: created.validUntil,
      noExpiry: created.noExpiry,
      hasFile: created.hasFile,
      downloadUrl: created.downloadUrl,
    },
    { status: 201 },
  );
});
