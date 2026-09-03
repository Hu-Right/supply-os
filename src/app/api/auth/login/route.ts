/**
 * POST /api/auth/login — 登录（手机号/邮箱 + 密码）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { verifyPassword, needsUpgrade, buildUserResponse, hashPassword, issueTokenPair } from "@/lib/services/auth";
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

  const ctx = getContext();
  const usersRepo = ctx.user.usersRepo;
  const authRepo = ctx.user.authRepo;
  const membershipRepo = ctx.user.membershipRepo;
  const registrationRepo = ctx.supplier.registrationRepo;

  const user = await usersRepo.findAuthByIdentifier(identifier);

  const hashType = user?.password_hash_type ?? "sha256";
  if (!user || !user.password_hash) {
    // 恒时验证防时序攻击
    await verifyPassword(password || "", "$2b$12$AAAAAAAAAAAAAAAAAAAAAAOqGHn2kLJ3xQ4y5m6n7p8r9s0t1u2v3w", "bcrypt");
    routeError(401, 40042, "账号或密码错误");
  }
  if (!(await verifyPassword(password || "", user.password_hash, hashType))) {
    routeError(401, 40042, "账号或密码错误");
  }
  if (user.account_status === "disabled" || user.account_status === "rejected") {
    routeError(403, 40003, "账号未通过审核或已停用");
  }

  if (needsUpgrade(hashType)) {
    const newHash = await hashPassword(password);
    await usersRepo.updatePassword(user.user_key, newHash, "bcrypt");
  }

  const payload = await buildUserResponse(user, membershipRepo, registrationRepo);
  let tokens: { token: string; refresh_token: string } | null = null;
  try {
    tokens = await issueTokenPair(authRepo, user.user_key, user.email || "");
  } catch { /* JWT_SECRET 未配置，静默降级 */ }

  const response = NextResponse.json({ success: true, user: payload, token: tokens?.token });
  if (tokens) setRefreshCookieOnResponse(response, tokens.refresh_token);
  return response;
});
