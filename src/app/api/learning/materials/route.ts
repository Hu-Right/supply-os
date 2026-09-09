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
import { listMaterials } from "@/lib/services/learning-service";

export async function GET() {
  try {
    const materials = await listMaterials();
    return NextResponse.json({ materials });
  } catch {
    return NextResponse.json({ materials: [] }, { status: 500 });
  }
}
