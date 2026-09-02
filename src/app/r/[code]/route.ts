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

/** 推荐链接格式：/r/EMP-XXXXXXXX */
const CODE_PATTERN = /^EMP-[A-Z0-9]{4,12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  // 从请求头获取实际访问的 origin（而非绑定地址 0.0.0.0）
  // 本地开发：192.168.x.x:3000；生产环境：osneosmart.com
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  // 基本格式校验，防止非法值写入 Cookie
  if (!CODE_PATTERN.test(normalized)) {
    return NextResponse.redirect(new URL("/showroom", origin));
  }

  // 7 天后过期
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  // 使用请求 Host 头构建 origin，确保重定向到用户实际访问的同一域名，
  // 避免跨域导致 Cookie 丢失。
  const response = NextResponse.redirect(new URL("/showroom?qr=1", origin));

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
