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
import { SITE_URL } from "@/lib/services/seo/site";

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
    return NextResponse.redirect(new URL("/showroom", SITE_URL));
  }

  // 7 天后过期
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  // 使用 SITE_URL 作为重定向 base（而非 req.url）：
  // Next.js standalone 背后有 nginx 反向代理时，req.url 为内部地址
  // （如 http://0.0.0.0:3039/...），会导致重定向到无效地址。
  const response = NextResponse.redirect(new URL("/showroom", SITE_URL));

  response.cookies.set("ref_code", normalized, {
    path: "/",
    expires,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
