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

  // 重定向目标用请求 URL 解析（审查 F62-lite）：不再手工拼接
  // x-forwarded-proto/host 头，消除头注入/缓存投毒拼接面
  const response = NextResponse.redirect(new URL("/showroom", req.url));

  response.cookies.set("ref_code", normalized, {
    path: "/",
    expires,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
