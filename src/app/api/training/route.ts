/**
 * /api/training — 已废弃
 *
 * @module app/api/training/route
 * @description 所有子路径端点已拆分到各自独立的 route.ts 文件。
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { code: 40410, message: "此接口已废弃，请使用子路由端点" },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { code: 40410, message: "此接口已废弃，请使用子路由端点" },
    { status: 410 },
  );
}
