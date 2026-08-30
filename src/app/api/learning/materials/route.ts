/**
 * GET /api/learning/materials — 获取全部学习资料列表
 *
 * 付费墙（审查报告 F4）：premium 资料的正文（contentZh/contentEn）与文件
 * 直链（fileUrl/fileName）不在列表中下发，统一走
 * GET /api/learning/materials/[materialId]/content 按登录 + 购买记录校验后返回。
 * 免费资料保持正文/文件随列表下发。
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
      materials: materials.map((m) => {
        const premium = m.is_premium === 1;
        return {
          id: m.material_id,
          titleZh: m.title_zh,
          titleEn: m.title_en,
          categoryZh: m.category_zh,
          categoryEn: m.category_en,
          summaryZh: m.summary_zh,
          summaryEn: m.summary_en,
          contentZh: premium ? "" : (m.content_zh ?? ""),
          contentEn: premium ? "" : (m.content_en ?? ""),
          isPremium: premium,
          downloadsCount: m.downloads_count,
          number: m.number,
          price: Number(m.price),
          fileUrl: premium ? "" : m.file_url,
          fileName: premium ? "" : m.file_name,
        };
      }),
    });
  } catch {
    return NextResponse.json({ materials: [] }, { status: 500 });
  }
}
