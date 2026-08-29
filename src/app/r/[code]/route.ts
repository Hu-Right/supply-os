/**
 * GET /r/[code] — 推荐链接落地页
 *
 * 员工分享专属链接（如 https://platform.com/r/EMP-XCAO26A1），
 * 用户点击后自动写入 ref_code Cookie（7 天有效），
 * 随后重定向到首页。注册时 API 读取 Cookie 完成归属。
 *
 * @module app/r/[code]/route
 */
import { NextRequest, NextResponse } from "next/server";

/** 推荐链接格式：/r/EMP-XXXXXXXX */
const CODE_PATTERN = /^EMP-[A-Z0-9]{4,12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  // 基本格式校验，防止非法值写入 Cookie
  if (!CODE_PATTERN.test(normalized)) {
    return NextResponse.redirect(new URL("/showroom", req.url));
  }

  // 7 天后过期
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  // 从请求头获取 host，避免 0.0.0.0 导致浏览器无法访问
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const redirectUrl = `${protocol}://${host}/showroom`;
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set("ref_code", normalized, {
    path: "/",
    expires,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
