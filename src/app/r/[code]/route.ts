/**
 * GET /r/[code] — 员工推广扫码落地页
 *
 * 员工分享专属二维码（如 https://osneosmart.com/r/EMP-XCAO26A1），
 * 用户扫码后自动写入 ref_code Cookie（7 天有效），
 * 随后重定向到供应商资质表单页。提交时 API 读取 Cookie 完成员工归属绑定。
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

  // 推荐码 Cookie（7 天有效，注册时自动填入邀请码）
  response.cookies.set("ref_code", normalized, {
    path: "/",
    expires,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // ★ 自动打开注册弹窗信号（会话级 Cookie，浏览器关闭即失效）
  // 前端 layout-shell 读取后自动弹出 AuthModal 并切到注册 Tab，随后删除此 Cookie。
  response.cookies.set("qr_auto_open", "1", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
