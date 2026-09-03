/**
 * GET /api/learning/materials/[materialId]/content — 学习资料正文与下载地址
 *
 * 付费墙闸口（审查报告 F4）：
 * - premium 资料：需登录 + 已购买（crm_learning_material_purchases 记录）才返回
 * - 免费资料：直接返回
 *
 * @module app/api/learning/materials/[materialId]/content/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { LearningMaterialsRepo } from "@/lib/repos/learning-materials.repo";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ materialId: string }> },
) {
  const { materialId } = await params;
  if (!materialId) {
    return NextResponse.json({ code: 40000, message: "Invalid material ID" }, { status: 400 });
  }

  const repo = new LearningMaterialsRepo(getPool());
  const material = await repo.findByMaterialId(materialId);
  if (!material) {
    return NextResponse.json({ code: 40044, message: "学习资料不存在" }, { status: 404 });
  }

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
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const purchasedIds = await repo.findPurchasedMaterialIds(auth.userId!);
  if (!purchasedIds.includes(materialId)) {
    return NextResponse.json({ code: 40301, message: "请先购买后查看" }, { status: 403 });
  }

  return NextResponse.json(payload);
}
