/**
 * GET /api/learning/materials — 获取全部学习资料列表
 *
 * @module app/api/learning/materials/route
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { LearningMaterialsRepo } from "@/lib/repos/learning-materials.repo";

export async function GET() {
  try {
    const pool = getPool();
    const repo = new LearningMaterialsRepo(pool);
    const materials = await repo.findAll();

    return NextResponse.json({
      materials: materials.map((m) => ({
        id: m.material_id,
        titleZh: m.title_zh,
        titleEn: m.title_en,
        categoryZh: m.category_zh,
        categoryEn: m.category_en,
        summaryZh: m.summary_zh,
        summaryEn: m.summary_en,
        contentZh: m.content_zh ?? "",
        contentEn: m.content_en ?? "",
        isPremium: m.is_premium === 1,
        downloadsCount: m.downloads_count,
        number: m.number,
        price: Number(m.price),
        fileUrl: m.file_url,
        fileName: m.file_name,
      })),
    });
  } catch {
    return NextResponse.json({ materials: [] }, { status: 500 });
  }
}
