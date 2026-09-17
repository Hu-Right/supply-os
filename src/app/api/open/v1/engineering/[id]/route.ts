/**
 * GET /api/open/v1/engineering/:id — 单条工程类商机详情（开放 API）
 *
 * @module app/api/open/v1/engineering/[id]/route
 * @description 对外开放 API 端点，返回单条工程类采购商机完整数据。
 *              认证方式：X-API-Key 请求头。
 *              仅 pro 档可访问详情端点，basic 档返回 403。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { authenticateOpenApiKey } from "@/lib/middleware/open-api-auth";
import { queryEngineeringDetail } from "@/lib/services/open-api/engineering";
import { extractClientIp } from "@/lib/utils/ip";
import { EC_OPPORTUNITY_NOT_FOUND, EC_ACCESS_FORBIDDEN } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const ctx = getContext();
    const repo = ctx.openApiRepo;

    // API Key 认证
    const auth = await authenticateOpenApiKey(req, repo);
    if (auth instanceof NextResponse) return auth;

    // basic 档不允许访问详情
    if (auth.tier !== "pro") {
      routeError(403, EC_ACCESS_FORBIDDEN, "详情端点仅 pro 套餐可用，请升级套餐后重试");
    }

    const { id } = await params;
    const opportunityId = Number(id);
    if (!opportunityId) {
      routeError(400, 40000, "无效的机会 ID");
    }

    const item = await queryEngineeringDetail(ctx.dbPool, opportunityId);
    if (!item) {
      routeError(404, EC_OPPORTUNITY_NOT_FOUND, "商机不存在或不属于工程类");
    }

    // 记录用量
    await repo.recordUsage(auth.keyId, "engineering/detail", auth.tier, 200, extractClientIp(req));

    return NextResponse.json({
      tier: auth.tier,
      item,
    });
  },
);
