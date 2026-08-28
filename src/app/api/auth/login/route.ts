/**
 * POST /api/auth/login — 登录（仅手机号 + 密码）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { verifyPassword, needsUpgrade, buildUserResponse, hashPassword, issueTokenPair } from "@/lib/services/auth";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

const PHONE_RE = /^1[3-9]\d{9}$/;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const identifier = String(body.identifier || "").trim();
  const password = String(body.password || "");

  // 仅接受手机号登录
  if (!PHONE_RE.test(identifier)) {
    return NextResponse.json({ code: 40011, message: "请输入有效的手机号" }, { status: 400 });
  }

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
    return NextResponse.json({ code: 40042, message: "账号或密码错误" }, { status: 401 });
  }
  if (!(await verifyPassword(password || "", user.password_hash, hashType))) {
    return NextResponse.json({ code: 40042, message: "账号或密码错误" }, { status: 401 });
  }
  if (user.account_status === "disabled" || user.account_status === "rejected") {
    return NextResponse.json({ code: 40003, message: "账号未通过审核或已停用" }, { status: 403 });
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
}
