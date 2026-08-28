/**
 * GET /favicon.ico — 返回空响应，避免 404 噪音
 * 项目暂无独立 favicon 文件，浏览器默认请求此路径
 */
import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(null, { status: 204 });
}
