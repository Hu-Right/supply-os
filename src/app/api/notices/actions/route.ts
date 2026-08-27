/**
 * /api/notices/actions — 已废弃
 *
 * @module app/api/notices/actions/route
 * @description 所有子路径端点（unlocks/feedback/view/unlock/interest）
 *              已拆分到各自独立的 route.ts 文件。
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { code: 40410, message: "Gone — this endpoint has been split into dedicated route files." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { code: 40410, message: "Gone — this endpoint has been split into dedicated route files." },
    { status: 410 },
  );
}
