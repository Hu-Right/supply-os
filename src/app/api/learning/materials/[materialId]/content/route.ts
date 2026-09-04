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
import { getPool } from "@/lib/db/pool";
import { LearningMaterialsRepo } from "@/lib/repos/learning-materials.repo";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";

export const GET = withRoute<{ params: Promise<{ materialId: string }> }>(
  async (req, { params }) => {
    const { materialId } = await params;
    if (!materialId) routeError(400, 40000, "Invalid material ID");

    const repo = new LearningMaterialsRepo(getPool());
    const material = await repo.findByMaterialId(materialId);
    if (!material) routeError(404, 40044, "学习资料不存在");

    const payload = {
      contentZh: material.content_zh ?? "",
      contentEn: material.content_en ?? "",
      fileUrl: material.file_url,
      fileName: material.file_name,
    };

    // 免费资料直接返回
    if (material.is_premium !== 1) {
      return NextResponse.json(payload);
    }

    // premium 资料：登录 + 购买记录双校验
    const auth = await requireUserKeyOrThrow(req);

    const purchasedIds = await repo.findPurchasedMaterialIds(auth.userId);
    if (!purchasedIds.includes(materialId)) {
      routeError(403, 40301, "请先购买后查看");
    }

    return NextResponse.json(payload);
  },
);
