/**
 * /api/payments — 已废弃
 * @module app/api/payments/route
 * @description 子路径端点已拆分到 config-status/route.ts 和 [orderNo]/mock-paid/route.ts。
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ code: 40410, message: "Gone — use /api/payments/config-status or /api/payments/:orderNo/mock-paid" }, { status: 410 });
}
export async function POST() {
  return NextResponse.json({ code: 40410, message: "Gone — use /api/payments/:orderNo/mock-paid" }, { status: 410 });
}
