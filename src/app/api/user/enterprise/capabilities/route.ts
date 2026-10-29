/**
 * GET  /api/user/enterprise/capabilities — 企业能力档案列表
 * POST /api/user/enterprise/capabilities — 新增能力项（证书/业绩/财务/人员/本地化/注册/技术/文本）
 *
 * @module app/api/user/enterprise/capabilities/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { EnterpriseProfileRepo } from "@/lib/repos/enterprise-profile.repo";
import { addCapability, createEnterpriseProfileRepo, getEnterpriseProfile } from "@/lib/services/enterprise-profile";

const capabilityBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  value: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const data = await getEnterpriseProfile(repo, auth.userId);
  return NextResponse.json({
    enterpriseId: data.enterpriseId,
    company: data.company,
    capabilities: data.capabilities.map((c) => ({ id: c.id, type: c.type, name: c.name, value: c.value })),
    evidence: data.evidence.map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      validFrom: e.validFrom,
      validUntil: e.validUntil,
      noExpiry: e.noExpiry,
      hasFile: e.hasFile,
    })),
  });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, capabilityBodySchema);
  const ctx = getContext();
  const repo = createEnterpriseProfileRepo(new EnterpriseProfileRepo(ctx.dbPool));
  const created = await addCapability(repo, auth.userId, body);
  return NextResponse.json(
    { id: created.id, type: created.type, name: created.name, value: created.value },
    { status: 201 },
  );
});
