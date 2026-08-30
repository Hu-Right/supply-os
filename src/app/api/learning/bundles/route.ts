/**
 * GET /api/learning/bundles — 获取打包套餐列表
 *
 * 套餐配置与服务端定价共用 src/lib/data/learning-bundles.ts（唯一事实来源）。
 *
 * @module app/api/learning/bundles/route
 */
import { NextResponse } from "next/server";
import { LEARNING_BUNDLES } from "@/lib/data/learning-bundles";

export async function GET() {
  return NextResponse.json({ bundles: LEARNING_BUNDLES });
}
