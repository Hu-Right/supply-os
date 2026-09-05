/**
 * POST /api/auth/register — 用户注册
 *
 * A4 下沉后路由仅保留：请求解析、Cookie 邀请码回退、IP/UA 提取、Refresh Cookie 写入；
 * 编排见 lib/services/auth-register.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { registerUser } from "@/lib/services/auth-register";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

// 字段顺序即校验优先级（zod issues[0] 与原实现的报错顺序一致）
const registerSchema = z.object({
  display_name: z.string({ error: "请填写姓名" }).trim().min(1, "请填写姓名"),
  phone: z.string({ error: "请输入有效的手机号" }).trim().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  password: z.string({ error: "密码不能为空" }).min(1, "密码不能为空"),
  verify_code: z.string({ error: "请输入短信验证码" }).min(1, "请输入短信验证码"),
  invitation_code: z.string().optional(),
  user_type: z.string().optional(),
  locale: z.string().optional(),
  agreement_version: z.string().optional(),
  agreement_accepted_at: z.string().optional(),
});

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, registerSchema, {
    display_name: 40000, phone: 40011, password: 40001, verify_code: 40005,
  });

  // ★ 邀请码优先级：手动填写 > Cookie ref_code（推荐链接自动带入）
  let inviteCode = String(body.invitation_code || "").trim().toUpperCase();
  if (!inviteCode) {
    const cookieCode = req.cookies.get("ref_code")?.value;
    if (cookieCode) inviteCode = cookieCode.trim().toUpperCase();
  }

  // ── 合规审计：IP / UA 提取（同意日志用） ──
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const { payload, accessToken, refreshToken } = await registerUser(getContext(), {
    displayName: body.display_name,
    targetPhone: body.phone,
    password: body.password,
    code: body.verify_code,
    inviteCode,
    userType: body.user_type === "personal" ? "personal" : "enterprise",
    locale: body.locale,
    agreementVersion: body.agreement_version,
    agreementAcceptedAt: body.agreement_accepted_at,
    clientIp,
    userAgent,
  });

  const response = NextResponse.json({
    success: true,
    user: payload,
    token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  }, { status: 201 });
  if (refreshToken) setRefreshCookieOnResponse(response, refreshToken);
  // 注册成功后清除推荐链接 Cookie，避免重复归属
  response.cookies.set("ref_code", "", { maxAge: 0, path: "/" });
  return response;
});
