/**
 * GET  /api/user/enterprise/evidence — 企业证据资料列表
 * POST /api/user/enterprise/evidence — 登记一条证据（JSON：category/title/validFrom/validUntil/noExpiry）
 *
 * @module app/api/user/enterprise/evidence/route
 * @description 2026-11-18 起证据资料只做「登记」（类目 + 名称 + 有效期），不再接收文件上传：
 *              可行性报告只引用这些元数据，托管企业文件反而带来病毒/版权/“平台已核验”的误读，
 *              故整体摘除上传能力（文件字节存储与下载路由一并删除）。
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
    })),
  });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 application/json 登记证据（无需上传文件）");
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const created = await addEvidence(repo, auth.userId, {
    category: body.category,
    title: body.title,
    validFrom: body.validFrom,
    validUntil: body.validUntil,
    noExpiry: body.noExpiry === true || body.noExpiry === "1" || body.noExpiry === "true",
  });
  return NextResponse.json(
    {
      id: created.id,
      category: created.category,
      title: created.title,
      validFrom: created.validFrom,
      validUntil: created.validUntil,
      noExpiry: created.noExpiry,
    },
    { status: 201 },
  );
});
