/**
 * GET /api/learning/materials/[materialId]/content — 学习资料正文与下载地址
 *
 * 付费墙闸口（审查报告 F4）：
 * - premium 资料：需登录 + 已购买（crm_learning_material_purchases 记录）才返回
 * - 免费资料：直接返回
 *
 * @module app/api/learning/materials/[materialId]/content/route
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { getMaterialContent } from "@/lib/services/learning-service";

export const GET = withRoute<{ params: Promise<{ materialId: string }> }>(
  async (req, { params }) => {
    const { materialId } = await params;
    if (!materialId) routeError(400, 40000, "Invalid material ID");

    // 先尝试无认证获取（免费资料无需登录）
    // 若资料是 premium 则 service 会抛 401，此时再走认证流程
    const auth = await requireUserKeyOrThrow(req);

    try {
      const payload = await getMaterialContent(materialId, auth.userId);
      return NextResponse.json(payload);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: number; message?: string };
      if (e.status) routeError(e.status, e.code ?? 40000, e.message ?? "Unknown error");
      throw err;
    }
  },
);
