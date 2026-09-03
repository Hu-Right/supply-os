/**
 * POST /api/auth/login — 登录（手机号/邮箱 + 密码）
 *
 * A4 下沉后路由仅保留：请求解析、限流、Refresh Cookie 写入；
 * 编排见 lib/services/auth-login.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { loginWithPassword } from "@/lib/services/auth-login";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";

const loginSchema = z.object({
  identifier: z.string({ error: "请输入手机号或邮箱" }).trim().min(1, "请输入手机号或邮箱"),
  password: z.string().default(""),
});

export const POST = withRoute(async (req: NextRequest) => {
  const { identifier, password } = await parseJson(req, loginSchema, { identifier: 40011 });

  // 限流（审查 F11）：IP 与账号双维度，防密码爆破/撞库
  const rlIp = checkRateLimit(req, { windowMs: 15 * 60_000, maxAttempts: 30 },
    (r) => `login-ip:${extractClientIp(r)}`);
  if (rlIp) return rlIp;
  const rlAccount = checkRateLimit(req, { windowMs: 15 * 60_000, maxAttempts: 10 },
    () => `login-acct:${identifier.toLowerCase()}`);
  if (rlAccount) return rlAccount;

  const { payload, accessToken, refreshToken } = await loginWithPassword(getContext(), { identifier, password });

  // 契约保真：无 token 时键省略（undefined），而非显式 null
  const response = NextResponse.json({ success: true, user: payload, token: accessToken ?? undefined });
  if (refreshToken) setRefreshCookieOnResponse(response, refreshToken);
  return response;
});
