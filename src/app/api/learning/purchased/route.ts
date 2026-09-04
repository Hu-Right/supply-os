/**
 * GET /api/learning/purchased — 查询当前用户已购买的学习资料 ID 列表
 *
 * @module app/api/learning/purchased/route
 */
import { NextRequest, NextResponse } from "next/server";
import { extractUserKey } from "@/lib/middleware/auth";
import { getPool } from "@/lib/db/pool";
import { LearningMaterialsRepo } from "@/lib/repos/learning-materials.repo";

export async function GET(req: NextRequest) {
  const { userId } = await extractUserKey(req);
  if (!userId) {
    return NextResponse.json({ material_ids: [] });
  }

  try {
    const pool = getPool();
    const repo = new LearningMaterialsRepo(pool);
    const materialIds = await repo.findPurchasedMaterialIds(userId);
    return NextResponse.json({ material_ids: materialIds });
  } catch {
    return NextResponse.json({ material_ids: [] });
  }
}
